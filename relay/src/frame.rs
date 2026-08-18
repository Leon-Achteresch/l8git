use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine as _;
use serde::{Deserialize, Serialize};

pub const OP_OPEN: &str = "open";
pub const OP_DATA: &str = "data";
pub const OP_CLOSE: &str = "close";

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayFrame {
    pub conn_id: String,
    pub op: String,
    #[serde(default)]
    pub data: String,
}

impl RelayFrame {
    pub fn open(conn_id: &str) -> Self {
        Self {
            conn_id: conn_id.to_string(),
            op: OP_OPEN.to_string(),
            data: String::new(),
        }
    }

    pub fn close(conn_id: &str) -> Self {
        Self {
            conn_id: conn_id.to_string(),
            op: OP_CLOSE.to_string(),
            data: String::new(),
        }
    }

    pub fn data(conn_id: &str, payload: &[u8]) -> Self {
        Self {
            conn_id: conn_id.to_string(),
            op: OP_DATA.to_string(),
            data: B64.encode(payload),
        }
    }

    pub fn payload(&self) -> Result<Vec<u8>, String> {
        B64.decode(self.data.as_bytes())
            .map_err(|e| format!("relay frame data is not valid base64: {e}"))
    }

    pub fn parse(raw: &[u8]) -> Result<Self, String> {
        serde_json::from_slice(raw).map_err(|e| format!("invalid relay frame: {e}"))
    }

    pub fn encode(&self) -> String {
        serde_json::to_string(self).unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frames_use_the_wire_shape_from_the_concept() {
        assert_eq!(
            RelayFrame::data("c1", b"hi").encode(),
            r#"{"connId":"c1","op":"data","data":"aGk="}"#
        );
        assert_eq!(
            RelayFrame::open("c1").encode(),
            r#"{"connId":"c1","op":"open","data":""}"#
        );
        assert_eq!(
            RelayFrame::close("c1").encode(),
            r#"{"connId":"c1","op":"close","data":""}"#
        );
    }

    #[test]
    fn frames_round_trip_through_json() {
        let frame = RelayFrame::data("abc", &[0u8, 1, 2, 255]);
        let parsed = RelayFrame::parse(frame.encode().as_bytes()).unwrap();
        assert_eq!(parsed, frame);
        assert_eq!(parsed.payload().unwrap(), vec![0u8, 1, 2, 255]);
    }

    #[test]
    fn missing_data_and_garbage_are_handled() {
        let parsed = RelayFrame::parse(br#"{"connId":"c1","op":"close"}"#).unwrap();
        assert_eq!(parsed.data, "");
        assert!(parsed.payload().unwrap().is_empty());
        assert!(RelayFrame::parse(b"not json").is_err());
        assert!(RelayFrame::parse(br#"{"connId":"c1","op":"data","data":"!!"}"#)
            .unwrap()
            .payload()
            .is_err());
    }
}
