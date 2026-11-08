#!/usr/bin/env python3
import json, os, secrets, subprocess, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import tkinter as tk
from tkinter import ttk, messagebox

APP_DIR = Path.home() / ".config" / "Fb3d2yPrint"
APP_DIR.mkdir(parents=True, exist_ok=True)
TOKEN_FILE = APP_DIR / "connection.key"
if TOKEN_FILE.exists():
    TOKEN = TOKEN_FILE.read_text().strip()
else:
    TOKEN = secrets.token_hex(24)
    TOKEN_FILE.write_text(TOKEN)
    TOKEN_FILE.chmod(0o600)

ALLOWED_ORIGINS = {"https://fb3d2ymenu.com.br", "https://www.fb3d2ymenu.com.br"}
selected_printer = ""
status_callback = None

def printers():
    try:
        result = subprocess.run(["lpstat", "-p"], capture_output=True, text=True, timeout=5,
                                env={**os.environ, "LC_ALL": "C", "LANG": "C"})
        names = []
        for line in result.stdout.splitlines():
            parts = line.split()
            if len(parts) >= 2 and parts[0] == "printer":
                names.append(parts[1])
        return names
    except Exception:
        return []

def send_raw(content):
    if not selected_printer:
        raise RuntimeError("Selecione uma impressora no Fb3d2y Print.")
    payload = content.encode("cp860", errors="replace")
    result = subprocess.run(["lp", "-d", selected_printer, "-o", "raw"], input=payload,
                            capture_output=True, timeout=30)
    if result.returncode:
        detail = (result.stderr or result.stdout).decode(errors="replace").strip()
        raise RuntimeError(detail or "O CUPS não conseguiu enviar a impressão.")
    return selected_printer

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_): pass
    def respond(self, code, payload=None, origin=None):
        body = json.dumps(payload or {}).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Connection", "close")
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
            self.send_header("Access-Control-Allow-Private-Network", "true")
        self.end_headers()
        if code != 204:
            self.wfile.write(body)
    def do_OPTIONS(self):
        origin = self.headers.get("Origin")
        if origin not in ALLOWED_ORIGINS:
            return self.respond(403, {"ok": False, "error": "Origem não autorizada."})
        self.respond(204, origin=origin)
    def do_GET(self):
        origin = self.headers.get("Origin")
        if self.path != "/health":
            return self.respond(404, {"ok": False, "error": "Rota não encontrada."}, origin)
        if origin and origin not in ALLOWED_ORIGINS:
            return self.respond(403, {"ok": False, "error": "Origem não autorizada."})
        self.respond(200, {"ok": True, "app": "Fb3d2y Print", "version": "0.2.0",
                           "printer": selected_printer}, origin)
    def do_POST(self):
        origin = self.headers.get("Origin")
        if origin not in ALLOWED_ORIGINS:
            return self.respond(403, {"ok": False, "error": "Origem não autorizada."})
        if self.path != "/print":
            return self.respond(404, {"ok": False, "error": "Rota não encontrada."}, origin)
        if self.headers.get("Authorization") != "Bearer " + TOKEN:
            return self.respond(401, {"ok": False, "error": "Código de conexão inválido."}, origin)
        try:
            size = min(int(self.headers.get("Content-Length", "0")), 2_000_000)
            payload = json.loads(self.rfile.read(size))
            content = payload.get("content", "")
            if not isinstance(content, str) or not content.strip():
                raise ValueError("Comanda vazia.")
            destination = send_raw(content)
            self.respond(200, {"ok": True, "printer": destination}, origin)
            if status_callback: status_callback("Impressão enviada para " + destination)
        except Exception as exc:
            self.respond(400, {"ok": False, "error": str(exc)}, origin)

def run_server():
    server = ThreadingHTTPServer(("127.0.0.1", 17832), Handler)
    server.serve_forever()

def main():
    global selected_printer, status_callback
    root = tk.Tk()
    root.title("Fb3d2y Print")
    root.geometry("510x350")
    root.resizable(False, False)
    root.configure(bg="#fffaf6")
    style = ttk.Style()
    style.theme_use("clam")
    style.configure("TFrame", background="#fffaf6")
    style.configure("TLabel", background="#fffaf6", foreground="#29231f", font=("DejaVu Sans", 10))
    style.configure("Title.TLabel", font=("DejaVu Sans", 20, "bold"), foreground="#e66a28")
    style.configure("TButton", font=("DejaVu Sans", 10), padding=7)
    frame = ttk.Frame(root, padding=22)
    frame.pack(fill="both", expand=True)
    ttk.Label(frame, text="FB3D2Y PRINT", style="Title.TLabel").pack(anchor="w")
    ttk.Label(frame, text="Terminal de impressão do Fb3d2y Menu").pack(anchor="w", pady=(2,18))
    ttk.Label(frame, text="Impressora do sistema (CUPS)").pack(anchor="w")
    printer_box = ttk.Combobox(frame, state="readonly", width=52)
    printer_box.pack(anchor="w", pady=(5,8))
    status = ttk.Label(frame, text="Iniciando terminal…")
    status.pack(anchor="w", pady=(12,8))
    status_callback = lambda text: root.after(0, status.config, {"text": text})
    def refresh():
        found = printers()
        printer_box["values"] = found
        if selected_printer in found: printer_box.set(selected_printer)
        elif found: printer_box.current(0)
        choose()
        status.config(text=("Impressora encontrada." if found else "Nenhuma impressora CUPS encontrada."))
    def choose():
        global selected_printer
        selected_printer = printer_box.get().strip()
    printer_box.bind("<<ComboboxSelected>>", lambda _e: choose())
    buttons = ttk.Frame(frame)
    buttons.pack(anchor="w", pady=5)
    ttk.Button(buttons, text="Atualizar impressoras", command=refresh).pack(side="left", padx=(0,8))
    def test():
        try:
            send_raw("\x1b@\x1ba\x01\x1bE\x01FB3D2Y MENU\n\x1bE\x00\nTESTE DE IMPRESSAO\nConexao funcionando!\nPapel: 50 mm\n\n\n\x1dV\x00")
            status.config(text="Teste enviado para " + selected_printer)
        except Exception as exc:
            messagebox.showerror("Fb3d2y Print", str(exc))
    ttk.Button(buttons, text="Imprimir teste", command=test).pack(side="left")
    ttk.Label(frame, text="Código de conexão (cole nas configurações do site)").pack(anchor="w", pady=(18,4))
    token_row = ttk.Frame(frame)
    token_row.pack(fill="x")
    token_entry = ttk.Entry(token_row, width=49)
    token_entry.insert(0, TOKEN)
    token_entry.configure(state="readonly")
    token_entry.pack(side="left")
    def copy():
        root.clipboard_clear()
        root.clipboard_append(TOKEN)
        status.config(text="Código copiado.")
    ttk.Button(token_row, text="Copiar", command=copy).pack(side="left", padx=6)
    ttk.Label(frame, text="Deixe esta janela aberta enquanto o site estiver imprimindo.",
              foreground="#71665e").pack(anchor="w", pady=(15,0))
    refresh()
    threading.Thread(target=run_server, daemon=True).start()
    root.mainloop()

if __name__ == "__main__":
    main()
