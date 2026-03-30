mod capture;
mod commands;
mod db;
mod llm;
mod overlay;
mod reaction;
mod session;
mod state;
mod summary;

use state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // プロジェクトルートの .env を読み込む（存在しない場合はスキップ）
    let _ = dotenvy::dotenv();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to resolve app data dir");
            std::fs::create_dir_all(&app_data_dir).expect("Failed to create app data dir");
            let db = db::init_db(&app_data_dir).expect("Failed to initialize database");
            let state = AppState::new(db);
            app.manage(state);
            overlay::create_overlay(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::session::start_session,
            commands::session::stop_session,
            commands::session::get_session_state,
            commands::preview::get_ai_preview_state,
            commands::reactions::list_reactions,
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::summary::list_summaries,
            commands::summary::get_summary,
            commands::summary::update_summary_title,
            commands::summary::regenerate_summary_title,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
