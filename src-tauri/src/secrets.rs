use keyring::Entry;

const SERVICE: &str = "l8git";

/// Writes a secret into the OS keychain (Keychain / Credential Manager /
/// kernel keyring). Blocking — call from `spawn_blocking`.
pub fn set_secret(key: &str, value: &str) -> Result<(), String> {
    Entry::new(SERVICE, key)
        .map_err(|e| e.to_string())?
        .set_password(value)
        .map_err(|e| e.to_string())
}

/// Reads a secret from the OS keychain. `Ok(None)` means "not stored".
pub fn get_secret(key: &str) -> Result<Option<String>, String> {
    match Entry::new(SERVICE, key)
        .map_err(|e| e.to_string())?
        .get_password()
    {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Removes a secret. Deleting a missing entry is not an error.
pub fn delete_secret(key: &str) -> Result<(), String> {
    match Entry::new(SERVICE, key)
        .map_err(|e| e.to_string())?
        .delete_credential()
    {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub async fn secret_set(key: String, value: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || set_secret(&key, &value))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn secret_get(key: String) -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(move || get_secret(&key))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn secret_delete(key: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || delete_secret(&key))
        .await
        .map_err(|e| e.to_string())?
}
