use base64::engine::general_purpose::{STANDARD as B64, URL_SAFE_NO_PAD as B64URL};
use base64::Engine as _;
use chacha20poly1305::aead::{Aead, KeyInit};
use chacha20poly1305::{ChaCha20Poly1305, Key, Nonce};
use hkdf::Hkdf;
use hmac::{Hmac, Mac};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use subtle::ConstantTimeEq;
use x25519_dalek::{EphemeralSecret, PublicKey};

pub const PROTOCOL_VERSION: u8 = 1;
pub const HANDSHAKE_CONTEXT: &[u8] = b"l8git-hs-v1";
pub const AUTH_CONTEXT: &[u8] = b"l8git-auth-v1";
pub const HKDF_INFO: &[u8] = b"l8git-remote-v1";
pub const RELAY_CONTEXT: &[u8] = b"l8git-relay-v1";

pub const PSK_LEN: usize = 32;
pub const HOST_ID_LEN: usize = 16;
pub const HELLO_NONCE_LEN: usize = 16;

type HmacSha256 = Hmac<Sha256>;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Hello {
    pub v: u8,
    #[serde(rename = "type")]
    pub kind: String,
    pub host_id: String,
    pub eph: String,
    pub nonce: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Welcome {
    pub v: u8,
    #[serde(rename = "type")]
    pub kind: String,
    pub eph: String,
    pub tag: String,
}

pub fn random_bytes<const N: usize>() -> [u8; N] {
    let mut out = [0u8; N];
    rand::rngs::OsRng.fill_bytes(&mut out);
    out
}

pub fn random_psk_b64() -> String {
    B64.encode(random_bytes::<PSK_LEN>())
}

pub fn random_host_id() -> String {
    B64URL.encode(random_bytes::<HOST_ID_LEN>())
}

pub fn decode_psk(value: &str) -> Result<[u8; PSK_LEN], String> {
    let raw = B64
        .decode(value.trim())
        .map_err(|e| format!("psk is not valid base64: {e}"))?;
    let psk: [u8; PSK_LEN] = raw
        .try_into()
        .map_err(|_| format!("psk must be {PSK_LEN} bytes"))?;
    Ok(psk)
}

pub fn relay_token(psk: &[u8; PSK_LEN]) -> String {
    use sha2::Digest;
    let mut hasher = Sha256::new();
    hasher.update(psk);
    hasher.update(RELAY_CONTEXT);
    B64URL.encode(hasher.finalize())
}

fn decode_key(value: &str, label: &str) -> Result<[u8; 32], String> {
    let raw = B64
        .decode(value.trim())
        .map_err(|e| format!("{label} is not valid base64: {e}"))?;
    raw.try_into()
        .map_err(|_| format!("{label} must be 32 bytes"))
}

fn tag(psk: &[u8; PSK_LEN], context: &[u8], client_eph: &[u8], server_eph: &[u8], nonce: &[u8]) -> [u8; 32] {
    let mut mac = <HmacSha256 as Mac>::new_from_slice(psk).expect("hmac accepts any key length");
    mac.update(context);
    mac.update(client_eph);
    mac.update(server_eph);
    mac.update(nonce);
    mac.finalize().into_bytes().into()
}

fn verify_tag_b64(expected: &[u8; 32], provided: &str) -> bool {
    let Ok(raw) = B64.decode(provided.trim()) else {
        return false;
    };
    if raw.len() != expected.len() {
        return false;
    }
    expected.ct_eq(raw.as_slice()).into()
}

fn nonce_bytes(counter: u64) -> [u8; 12] {
    let mut out = [0u8; 12];
    out[..8].copy_from_slice(&counter.to_le_bytes());
    out
}

pub struct Sealer {
    cipher: ChaCha20Poly1305,
    counter: u64,
}

impl Sealer {
    pub fn seal(&mut self, plaintext: &[u8]) -> Result<Vec<u8>, String> {
        let nonce = nonce_bytes(self.counter);
        let ciphertext = self
            .cipher
            .encrypt(Nonce::from_slice(&nonce), plaintext)
            .map_err(|_| "encryption failed".to_string())?;
        self.counter = self
            .counter
            .checked_add(1)
            .ok_or_else(|| "nonce counter exhausted".to_string())?;
        let mut frame = Vec::with_capacity(nonce.len() + ciphertext.len());
        frame.extend_from_slice(&nonce);
        frame.extend_from_slice(&ciphertext);
        Ok(frame)
    }

    pub fn seal_json(&mut self, value: &serde_json::Value) -> Result<Vec<u8>, String> {
        let raw = serde_json::to_vec(value).map_err(|e| e.to_string())?;
        self.seal(&raw)
    }
}

pub struct Opener {
    cipher: ChaCha20Poly1305,
    counter: u64,
}

impl Opener {
    pub fn open(&mut self, frame: &[u8]) -> Result<Vec<u8>, String> {
        if frame.len() < 12 + 16 {
            return Err("frame too short".into());
        }
        let expected = nonce_bytes(self.counter);
        if frame[..12] != expected {
            return Err("unexpected frame counter".into());
        }
        let plaintext = self
            .cipher
            .decrypt(Nonce::from_slice(&expected), &frame[12..])
            .map_err(|_| "frame authentication failed".to_string())?;
        self.counter = self
            .counter
            .checked_add(1)
            .ok_or_else(|| "nonce counter exhausted".to_string())?;
        Ok(plaintext)
    }

    pub fn open_json(&mut self, frame: &[u8]) -> Result<serde_json::Value, String> {
        let raw = self.open(frame)?;
        serde_json::from_slice(&raw).map_err(|e| format!("frame is not valid JSON: {e}"))
    }
}

pub struct Session {
    pub sealer: Sealer,
    pub opener: Opener,
    auth_tag: [u8; 32],
}

impl Session {
    pub fn auth_tag_b64(&self) -> String {
        B64.encode(self.auth_tag)
    }

    pub fn verify_auth_tag(&self, provided: &str) -> bool {
        verify_tag_b64(&self.auth_tag, provided)
    }

    pub fn auth_frame(&self) -> serde_json::Value {
        serde_json::json!({ "type": "auth", "tag": self.auth_tag_b64() })
    }

    pub fn split(self) -> (Sealer, Opener, [u8; 32]) {
        (self.sealer, self.opener, self.auth_tag)
    }
}

fn derive(
    shared: &[u8; 32],
    psk: &[u8; PSK_LEN],
    client_eph: &[u8; 32],
    server_eph: &[u8; 32],
    nonce: &[u8],
    server_side: bool,
) -> Session {
    let hk = Hkdf::<Sha256>::new(Some(psk), shared);
    let mut okm = [0u8; 64];
    hk.expand(HKDF_INFO, &mut okm)
        .expect("64 bytes is a valid hkdf output length");
    let k_c2s = Key::from_slice(&okm[..32]);
    let k_s2c = Key::from_slice(&okm[32..]);
    let (send, recv) = if server_side {
        (k_s2c, k_c2s)
    } else {
        (k_c2s, k_s2c)
    };
    Session {
        sealer: Sealer {
            cipher: ChaCha20Poly1305::new(send),
            counter: 0,
        },
        opener: Opener {
            cipher: ChaCha20Poly1305::new(recv),
            counter: 0,
        },
        auth_tag: tag(psk, AUTH_CONTEXT, client_eph, server_eph, nonce),
    }
}

pub struct ClientHandshake {
    secret: EphemeralSecret,
    client_eph: [u8; 32],
    nonce: [u8; HELLO_NONCE_LEN],
    psk: [u8; PSK_LEN],
}

pub fn client_hello(psk: &[u8; PSK_LEN], host_id: &str) -> (ClientHandshake, Hello) {
    let secret = EphemeralSecret::random_from_rng(rand::rngs::OsRng);
    let client_eph = PublicKey::from(&secret).to_bytes();
    let nonce = random_bytes::<HELLO_NONCE_LEN>();
    let hello = Hello {
        v: PROTOCOL_VERSION,
        kind: "hello".into(),
        host_id: host_id.to_string(),
        eph: B64.encode(client_eph),
        nonce: B64.encode(nonce),
    };
    (
        ClientHandshake {
            secret,
            client_eph,
            nonce,
            psk: *psk,
        },
        hello,
    )
}

impl ClientHandshake {
    pub fn finish(self, welcome: &Welcome) -> Result<Session, String> {
        if welcome.v != PROTOCOL_VERSION {
            return Err(format!("unsupported protocol version {}", welcome.v));
        }
        if welcome.kind != "welcome" {
            return Err(format!("unexpected handshake frame {}", welcome.kind));
        }
        let server_eph = decode_key(&welcome.eph, "server ephemeral key")?;
        let expected = tag(
            &self.psk,
            HANDSHAKE_CONTEXT,
            &self.client_eph,
            &server_eph,
            &self.nonce,
        );
        if !verify_tag_b64(&expected, &welcome.tag) {
            return Err("handshake tag mismatch".into());
        }
        let shared = self
            .secret
            .diffie_hellman(&PublicKey::from(server_eph))
            .to_bytes();
        Ok(derive(
            &shared,
            &self.psk,
            &self.client_eph,
            &server_eph,
            &self.nonce,
            false,
        ))
    }
}

pub fn server_accept(psk: &[u8; PSK_LEN], hello: &Hello) -> Result<(Welcome, Session), String> {
    if hello.v != PROTOCOL_VERSION {
        return Err(format!("unsupported protocol version {}", hello.v));
    }
    if hello.kind != "hello" {
        return Err(format!("unexpected handshake frame {}", hello.kind));
    }
    let client_eph = decode_key(&hello.eph, "client ephemeral key")?;
    let nonce = B64
        .decode(hello.nonce.trim())
        .map_err(|e| format!("hello nonce is not valid base64: {e}"))?;
    if nonce.len() != HELLO_NONCE_LEN {
        return Err(format!("hello nonce must be {HELLO_NONCE_LEN} bytes"));
    }
    let secret = EphemeralSecret::random_from_rng(rand::rngs::OsRng);
    let server_eph = PublicKey::from(&secret).to_bytes();
    let shared = secret
        .diffie_hellman(&PublicKey::from(client_eph))
        .to_bytes();
    let welcome = Welcome {
        v: PROTOCOL_VERSION,
        kind: "welcome".into(),
        eph: B64.encode(server_eph),
        tag: B64.encode(tag(psk, HANDSHAKE_CONTEXT, &client_eph, &server_eph, &nonce)),
    };
    let session = derive(&shared, psk, &client_eph, &server_eph, &nonce, true);
    Ok((welcome, session))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pair() -> (Session, Session) {
        let psk = decode_psk(&random_psk_b64()).unwrap();
        let (pending, hello) = client_hello(&psk, "host-under-test");
        let (welcome, server) = server_accept(&psk, &hello).unwrap();
        let client = pending.finish(&welcome).unwrap();
        (client, server)
    }

    #[test]
    fn full_handshake_agrees_on_keys_and_auth_tag() {
        let (client, server) = pair();
        assert_eq!(client.auth_tag_b64(), server.auth_tag_b64());
        assert!(server.verify_auth_tag(&client.auth_tag_b64()));
        assert!(!server.verify_auth_tag(&B64.encode([0u8; 32])));
        assert!(!server.verify_auth_tag("not-base64!!"));
        assert!(!server.verify_auth_tag(&B64.encode([0u8; 16])));
    }

    #[test]
    fn frames_round_trip_in_both_directions() {
        let (mut client, mut server) = pair();
        for i in 0..8u64 {
            let up = serde_json::json!({"type":"req","id":i,"cmd":"repo_status","args":{}});
            let frame = client.sealer.seal_json(&up).unwrap();
            assert_eq!(frame[..8], i.to_le_bytes());
            assert_eq!(server.opener.open_json(&frame).unwrap(), up);

            let down = serde_json::json!({"type":"res","id":i,"ok":true,"data":{"branch":"main"}});
            let frame = server.sealer.seal_json(&down).unwrap();
            assert_eq!(client.opener.open_json(&frame).unwrap(), down);
        }
    }

    #[test]
    fn auth_frame_shape_matches_the_protocol() {
        let (client, server) = pair();
        let frame = client.auth_frame();
        assert_eq!(frame["type"], "auth");
        assert!(server.verify_auth_tag(frame["tag"].as_str().unwrap()));
    }

    #[test]
    fn tampered_and_truncated_frames_are_rejected() {
        let (mut client, mut server) = pair();
        let mut frame = client.sealer.seal(b"{\"type\":\"ping\",\"t\":1}").unwrap();
        let last = frame.len() - 1;
        frame[last] ^= 0x01;
        assert!(server.opener.open(&frame).is_err());
        assert!(server.opener.open(&[0u8; 4]).is_err());
    }

    #[test]
    fn replayed_and_out_of_order_frames_are_rejected() {
        let (mut client, mut server) = pair();
        let first = client.sealer.seal(b"{\"t\":0}").unwrap();
        let second = client.sealer.seal(b"{\"t\":1}").unwrap();
        let third = client.sealer.seal(b"{\"t\":2}").unwrap();

        assert!(server.opener.open(&first).is_ok());
        assert!(server.opener.open(&first).is_err());
        assert!(server.opener.open(&third).is_err());
        assert!(server.opener.open(&second).is_ok());
        assert!(server.opener.open(&third).is_ok());
    }

    #[test]
    fn wrong_psk_fails_the_handshake() {
        let psk = decode_psk(&random_psk_b64()).unwrap();
        let other = decode_psk(&random_psk_b64()).unwrap();
        let (pending, hello) = client_hello(&psk, "host-under-test");
        let (welcome, _) = server_accept(&other, &hello).unwrap();
        assert!(pending.finish(&welcome).is_err());
    }

    #[test]
    fn psk_and_host_id_encoding_round_trips() {
        let psk_b64 = random_psk_b64();
        assert_eq!(decode_psk(&psk_b64).unwrap().len(), PSK_LEN);
        assert!(decode_psk("short").is_err());
        assert_eq!(
            B64URL.decode(random_host_id()).unwrap().len(),
            HOST_ID_LEN
        );
    }
}
