import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";
import type {
  OverlayReactionEvent,
  SessionState,
  SessionStateChangedEvent,
  SessionStatus,
} from "../types/ipc";

const REACTION_TIMEOUT_MS = 8_000;

function clearReactionTimer(timerRef: React.RefObject<number | null>) {
  if (timerRef.current !== null) {
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }
}

export default function OverlayApp() {
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [reaction, setReaction] = useState<string | null>(null);
  const reactionTimerRef = useRef<number | null>(null);
  const statusRef = useRef<SessionStatus>("idle");

  useEffect(() => {
    let mounted = true;
    let unsubscribeSession = () => {};
    let unsubscribeReaction = () => {};

    const resetToWaiting = () => {
      clearReactionTimer(reactionTimerRef);
      if (mounted) {
        setReaction(null);
      }
    };

    const hideOverlayState = () => {
      clearReactionTimer(reactionTimerRef);
      if (mounted) {
        setReaction(null);
      }
    };

    void (async () => {
      const sessionState = await invoke<SessionState>("get_session_state");
      if (!mounted) {
        return;
      }

      setStatus(sessionState.status);
      statusRef.current = sessionState.status;
      if (sessionState.status !== "active") {
        hideOverlayState();
      }

      unsubscribeSession = await listen<SessionStateChangedEvent>(
        "session_state_changed",
        ({ payload }) => {
          setStatus(payload.status);
          statusRef.current = payload.status;

          if (payload.status === "active") {
            resetToWaiting();
            return;
          }

          hideOverlayState();
        },
      );

      unsubscribeReaction = await listen<OverlayReactionEvent>(
        "overlay-reaction",
        ({ payload }) => {
          if (!mounted || statusRef.current !== "active") {
            return;
          }

          clearReactionTimer(reactionTimerRef);
          setReaction(payload.text);
          reactionTimerRef.current = window.setTimeout(() => {
            reactionTimerRef.current = null;
            if (mounted) {
              setReaction(null);
            }
          }, REACTION_TIMEOUT_MS);
        },
      );
    })();

    return () => {
      mounted = false;
      clearReactionTimer(reactionTimerRef);
      unsubscribeSession();
      unsubscribeReaction();
    };
  }, []);

  if (status !== "active") {
    return null;
  }

  const isWaiting = reaction === null;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        justifyContent: "flex-end",
        alignItems: "flex-start",
        padding: "8px",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          minWidth: "240px",
          maxWidth: "100%",
          borderRadius: "16px",
          padding: isWaiting ? "10px 14px" : "14px 18px",
          color: "white",
          border: isWaiting
            ? "1px solid rgba(255, 255, 255, 0.18)"
            : "1px solid rgba(255, 255, 255, 0.22)",
          background: isWaiting
            ? "rgba(15, 23, 42, 0.40)"
            : "rgba(15, 23, 42, 0.82)",
          boxShadow: isWaiting
            ? "0 8px 24px rgba(15, 23, 42, 0.16)"
            : "0 18px 45px rgba(15, 23, 42, 0.34)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
        }}
      >
        <div
          style={{
            fontSize: "11px",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            opacity: 0.72,
            marginBottom: "6px",
          }}
        >
          {isWaiting ? "セッション中" : "リアクション"}
        </div>
        <div
          style={{
            fontSize: isWaiting ? "13px" : "16px",
            lineHeight: isWaiting ? 1.45 : 1.5,
            fontWeight: isWaiting ? 500 : 600,
            wordBreak: "break-word",
          }}
        >
          {isWaiting
            ? "AI がこのセッションを見守っています。変化があればここにリアクションを表示します。"
            : reaction}
        </div>
      </div>
    </div>
  );
}
