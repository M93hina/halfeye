import { useState, useEffect } from "react";

export default function OverlayApp() {
  const [reaction, setReaction] = useState<string>("");

  useEffect(() => {
    const { listen } = (window as any).__TAURI__.event;
    let unlisten: (() => void) | null = null;

    (async () => {
      unlisten = await listen("overlay-reaction", (e: any) => {
        setReaction(e.payload.text);
        setTimeout(() => setReaction(""), 8000);
      });
    })();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  if (!reaction) return null;

  return (
    <div
      style={{
        background: "rgba(0, 0, 0, 0.7)",
        color: "white",
        padding: "12px 20px",
        borderRadius: "8px",
        fontSize: "16px",
        maxWidth: "100%",
        wordBreak: "break-word",
        margin: "8px",
      }}
    >
      {reaction}
    </div>
  );
}
