//! Mirra desktop shell.
//!
//! The UI is the same static Next.js export the website serves (`apps/web/out`). The only native
//! surface is a tiny secure-storage API so the desktop refresh token lives in the OS keychain
//! instead of web storage (see docs/adr/README.md, ADR-002).

mod secure_store;

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            secure_store::secure_store_get,
            secure_store::secure_store_set,
            secure_store::secure_store_delete
        ])
        .run(tauri::generate_context!())
        .expect("error while running Mirra");
}
