//! Keychain-backed storage for a small allow-list of secrets.
//!
//! The webview can only read or write the keys listed in `ALLOWED_KEYS`, so a compromised page
//! cannot use these commands to read arbitrary credentials from the user's keychain.

const SERVICE: &str = "app.mirra.desktop";
const ALLOWED_KEYS: &[&str] = &["refresh_token"];
const MAX_VALUE_LEN: usize = 512;

fn entry(key: &str) -> Result<keyring::Entry, String> {
    if !ALLOWED_KEYS.contains(&key) {
        return Err(format!("key '{key}' is not allowed"));
    }
    keyring::Entry::new(SERVICE, key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn secure_store_get(key: String) -> Result<Option<String>, String> {
    match entry(&key)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn secure_store_set(key: String, value: String) -> Result<(), String> {
    if value.is_empty() || value.len() > MAX_VALUE_LEN {
        return Err("value is empty or too long".into());
    }
    entry(&key)?.set_password(&value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn secure_store_delete(key: String) -> Result<(), String> {
    match entry(&key)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_keys_outside_the_allow_list() {
        assert!(secure_store_get("ssh_private_key".into()).is_err());
        assert!(secure_store_set("anything".into(), "x".into()).is_err());
        assert!(secure_store_delete("../../etc".into()).is_err());
    }

    #[test]
    fn rejects_oversized_values() {
        let err = secure_store_set("refresh_token".into(), "x".repeat(MAX_VALUE_LEN + 1)).unwrap_err();
        assert!(err.contains("too long"));
    }
}
