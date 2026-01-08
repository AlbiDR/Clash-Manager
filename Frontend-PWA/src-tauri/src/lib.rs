#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  // 🛡️ CRASH DIAGNOSTICS: Pipe Rust panics to Android logcat
  #[cfg(target_os = "android")]
  {
    std::panic::set_hook(Box::new(|info| {
      log::error!("💥 RUST PANIC: {}", info);
    }));
  }

  tauri::Builder::default()
    .plugin(tauri_plugin_log::Builder::default()
      .level(log::LevelFilter::Info)
      .build()
    )
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_os::init())
    .plugin(tauri_plugin_deep_link::init())
    .setup(|_app| {
      log::info!("🚀 Sovereign App Core Started (v2.x)");
      
      #[cfg(debug_assertions)]
      log::info!("🔍 Running in DEBUG mode");
      
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
