using System.Net;
using System.Text;
using System.Text.Json;

namespace Fb3d2yPrint;

internal sealed class PrintServer : IDisposable
{
    private readonly HttpListener listener = new();
    private readonly string token;
    private readonly Func<string> printer;
    private CancellationTokenSource? cancellation;

    public PrintServer(string token, Func<string> printer)
    {
        this.token = token;
        this.printer = printer;
        listener.Prefixes.Add("http://127.0.0.1:17832/");
    }

    public void Start()
    {
        if (listener.IsListening) return;
        cancellation = new CancellationTokenSource();
        listener.Start();
        _ = ListenAsync(cancellation.Token);
    }

    private async Task ListenAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested && listener.IsListening)
        {
            HttpListenerContext context;
            try { context = await listener.GetContextAsync(); }
            catch { if (ct.IsCancellationRequested || !listener.IsListening) break; else continue; }
            _ = Task.Run(() => HandleAsync(context), ct);
        }
    }

    private async Task HandleAsync(HttpListenerContext context)
    {
        var req = context.Request;
        var res = context.Response;
        try
        {
            var origin = req.Headers["Origin"] ?? "";
            if (origin == "https://fb3d2ymenu.com.br" || origin == "https://www.fb3d2ymenu.com.br")
            {
                res.Headers.Add("Access-Control-Allow-Origin", origin);
                res.Headers.Add("Vary", "Origin");
                res.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
                res.Headers.Add("Access-Control-Allow-Headers", "Content-Type, Authorization");
                res.Headers.Add("Access-Control-Allow-Private-Network", "true");
            }
            if (req.HttpMethod == "OPTIONS") { res.StatusCode = 204; return; }

            if (req.Url?.AbsolutePath == "/health" && req.HttpMethod == "GET")
            {
                await WriteJson(res, 200, new { ok = true, app = "Fb3d2y Print", version = "0.1.0", printer = printer() });
                return;
            }

            if (req.Url?.AbsolutePath != "/print" || req.HttpMethod != "POST")
            {
                await WriteJson(res, 404, new { ok = false, error = "Rota não encontrada." });
                return;
            }

            var auth = req.Headers["Authorization"] ?? "";
            if (!string.Equals(auth, "Bearer " + token, StringComparison.Ordinal))
            {
                await WriteJson(res, 401, new { ok = false, error = "Código de conexão inválido." });
                return;
            }

            using var reader = new StreamReader(req.InputStream, req.ContentEncoding);
            var body = await reader.ReadToEndAsync();
            var payload = JsonSerializer.Deserialize<PrintPayload>(body, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            if (payload is null || string.IsNullOrWhiteSpace(payload.Content))
            {
                await WriteJson(res, 400, new { ok = false, error = "Comanda vazia." });
                return;
            }
            var selectedPrinter = string.IsNullOrWhiteSpace(payload.Printer) ? printer() : payload.Printer;
            if (string.IsNullOrWhiteSpace(selectedPrinter))
            {
                await WriteJson(res, 400, new { ok = false, error = "Selecione uma impressora no Fb3d2y Print." });
                return;
            }
            if (!RawPrinter.Send(selectedPrinter, payload.Content, "Fb3d2y Menu"))
            {
                await WriteJson(res, 500, new { ok = false, error = "O Windows não conseguiu enviar a impressão. Confira a impressora." });
                return;
            }
            await WriteJson(res, 200, new { ok = true, printer = selectedPrinter });
        }
        catch (Exception ex)
        {
            try { await WriteJson(res, 500, new { ok = false, error = ex.Message }); } catch { }
        }
        finally { try { res.Close(); } catch { } }
    }

    private static async Task WriteJson(HttpListenerResponse response, int status, object data)
    {
        response.StatusCode = status;
        response.ContentType = "application/json; charset=utf-8";
        var bytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(data));
        response.ContentLength64 = bytes.Length;
        await response.OutputStream.WriteAsync(bytes);
    }

    public void Dispose()
    {
        try { cancellation?.Cancel(); listener.Stop(); listener.Close(); } catch { }
        cancellation?.Dispose();
    }

    private sealed class PrintPayload
    {
        public string? Printer { get; set; }
        public string? Content { get; set; }
    }
}
