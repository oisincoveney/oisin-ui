import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import "@xterm/xterm/css/xterm.css";

export interface TerminalViewProps {
  onTerminalReady?: (terminal: Terminal) => void;
  onDispose?: () => void;
  className?: string;
}

export function TerminalView({ onTerminalReady, onDispose, className = "" }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Create terminal instance
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
      fontSize: 14,
      lineHeight: 1.2,
      theme: {
        background: "hsl(227, 33%, 12%)",
        foreground: "hsl(220, 14%, 95%)",
        cursor: "hsl(220, 14%, 95%)",
        cursorAccent: "hsl(227, 33%, 12%)",
        selectionBackground: "hsla(220, 14%, 95%, 0.3)",
      },
      allowTransparency: true,
      scrollback: 10000,
    });

    terminalRef.current = term;

    // Load addons
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    let webglAddon: WebglAddon | null = null;
    try {
      webglAddon = new WebglAddon();
      // Only load webgl when terminal is opened, otherwise it crashes
    } catch (err) {
      console.warn("Failed to initialize WebGL addon", err);
    }

    // Mount to DOM
    term.open(containerRef.current);

    if (webglAddon) {
      try {
        term.loadAddon(webglAddon);
      } catch (err) {
        console.warn("Failed to load WebGL addon after open", err);
      }
    }

    // Initial fit
    // Use a small timeout to ensure DOM is ready and sized
    setTimeout(() => {
      try {
        fitAddon.fit();
        if (onTerminalReady) {
          onTerminalReady(term);
        }
      } catch (e) {
        // ignore fit errors during fast unmount
      }
    }, 10);

    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit();
      } catch (e) {
        // ignore
      }
    });
    
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      if (onDispose) {
        onDispose();
      }
      term.dispose();
      terminalRef.current = null;
    };
  }, [onTerminalReady, onDispose]);

  return (
    <div 
      ref={containerRef} 
      className={`w-full h-full overflow-hidden ${className}`} 
      style={{ padding: "8px" }}
    />
  );
}
