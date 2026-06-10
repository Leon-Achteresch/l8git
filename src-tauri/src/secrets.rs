use keyring::Entry;

const SERVICE: &str = "l8git";

#[tauri::command]
pub async fn secret_set(key: String, value: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        Entry::new(SERVICE, &key)
            .map_err(|e| e.to_string())?
            .set_password(&value)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn secret_get(key: String) -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(move || {
        match Entry::new(SERVICE, &key).map_err(|e| e.to_string())?.get_password() {
            Ok(v) => Ok(Some(v)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn secret_delete(key: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        match Entry::new(SERVICE, &key).map_err(|e| e.to_string())?.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}
