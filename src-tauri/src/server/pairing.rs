use std::net::{IpAddr, UdpSocket};

use keyring::Entry;
use serde_json::{json, Value};

use crate::server::crypto;

pub const KEYRING_SERVICE: &str = "l8gitd";
pub const HOST_ID_KEY: &str = "hostId";
pub const PSK_KEY: &str = "psk";

#[derive(Clone, Debug)]
pub struct Pairing {
    pub host_id: String,
    pub psk_b64: String,
}

impl Pairing {
    pub fn psk(&self) -> Result<[u8; crypto::PSK_LEN], String> {
        crypto::decode_psk(&self.psk_b64)
    }
}

fn read(key: &str) -> Result<Option<String>, String> {
    match Entry::new(KEYRING_SERVICE, key)
        .map_err(|e| e.to_string())?
        .get_password()
    {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

fn write(key: &str, value: &str) -> Result<(), String> {
    Entry::new(KEYRING_SERVICE, key)
        .map_err(|e| e.to_string())?
        .set_password(value)
        .map_err(|e| e.to_string())
}

pub fn load() -> Result<Option<Pairing>, String> {
    let (Some(host_id), Some(psk_b64)) = (read(HOST_ID_KEY)?, read(PSK_KEY)?) else {
        return Ok(None);
    };
    Ok(Some(Pairing { host_id, psk_b64 }))
}

pub fn load_or_create() -> Result<Pairing, String> {
    if let Some(existing) = load()? {
        return Ok(existing);
    }
    let pairing = Pairing {
        host_id: crypto::random_host_id(),
        psk_b64: crypto::random_psk_b64(),
    };
    write(HOST_ID_KEY, &pairing.host_id)?;
    write(PSK_KEY, &pairing.psk_b64)?;
    Ok(pairing)
}

pub fn reset() -> Result<(), String> {
    for key in [HOST_ID_KEY, PSK_KEY] {
        let entry = Entry::new(KEYRING_SERVICE, key).map_err(|e| e.to_string())?;
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => {}
            Err(e) => return Err(e.to_string()),
        }
    }
    Ok(())
}

pub fn lan_ip() -> Option<String> {
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("192.0.2.1:9").ok()?;
    let addr = socket.local_addr().ok()?.ip();
    match addr {
        IpAddr::V4(v4) if !v4.is_loopback() && !v4.is_unspecified() => Some(v4.to_string()),
        IpAddr::V6(v6) if !v6.is_loopback() && !v6.is_unspecified() => Some(v6.to_string()),
        _ => None,
    }
}

pub fn endpoints(port: u16, relay: Option<&str>) -> Vec<String> {
    let mut list = Vec::new();
    let host = lan_ip().unwrap_or_else(|| "127.0.0.1".to_string());
    let host = if host.contains(':') {
        format!("[{host}]")
    } else {
        host
    };
    list.push(format!("ws://{host}:{port}"));
    if let Some(relay) = relay.map(str::trim).filter(|r| !r.is_empty()) {
        list.push(relay.to_string());
    }
    list
}

pub fn payload(pairing: &Pairing, port: u16, relay: Option<&str>) -> Value {
    json!({
        "v": crypto::PROTOCOL_VERSION,
        "hostId": pairing.host_id,
        "psk": pairing.psk_b64,
        "name": crate::server::state::hostname(),
        "endpoints": endpoints(port, relay),
    })
}

pub fn qr(text: &str) -> Result<String, String> {
    use qrcode::render::unicode;
    let code = qrcode::QrCode::new(text.as_bytes()).map_err(|e| format!("QR-Code: {e}"))?;
    Ok(code
        .render::<unicode::Dense1x2>()
        .dark_color(unicode::Dense1x2::Light)
        .light_color(unicode::Dense1x2::Dark)
        .quiet_zone(true)
        .build())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn endpoints_contain_a_ws_url_and_the_relay() {
        let list = endpoints(8484, Some("wss://relay.example"));
        assert!(list[0].starts_with("ws://"));
        assert!(list[0].ends_with(":8484"));
        assert_eq!(list[1], "wss://relay.example");
        assert_eq!(endpoints(8484, Some("   ")).len(), 1);
    }

    #[test]
    fn payload_matches_the_pairing_contract() {
        let pairing = Pairing {
            host_id: crypto::random_host_id(),
            psk_b64: crypto::random_psk_b64(),
        };
        let payload = payload(&pairing, 8484, None);
        assert_eq!(payload["v"], 1);
        assert_eq!(payload["hostId"], pairing.host_id);
        assert_eq!(payload["psk"], pairing.psk_b64);
        assert!(payload["name"].is_string());
        assert_eq!(payload["endpoints"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn renders_a_terminal_qr_code() {
        let rendered = qr("{\"v\":1}").unwrap();
        assert!(rendered.lines().count() > 8);
    }
}
