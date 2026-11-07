using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;

namespace Fb3d2yPrint;

internal sealed class PrintServer : IDisposable
{
    private readonly TcpListener listener = new(IPAddress.Loopback, 17832);
    private readonly string token;
    private readonly Func<string> printer;
    private CancellationTokenSource? cancellation;

    public PrintServer(string token, Func<string> printer)
    {
        this.token = token;
        this.printer = printer;
    }

    public void Start()
    {
        if (cancellation is not null) return;
        cancellation = new CancellationTokenSource();
        listener.Start();
        _ = ListenAsync(cancellation.Token);
    }

    private async Task ListenAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            TcpClient client;
            try { client = await listener.AcceptTcpClientAsync(ct); }
            catch { if (ct.IsCancellationRequested) break; else continue; }
            _ = Task.Run(() => HandleAsync(client, ct), ct);
        }
    }

    private async Task HandleAsync(TcpClient client, CancellationToken ct)
    {
        using (client)
        {
            var stream = client.GetStream();
            try
            {
                var headerBytes = new List<byte>(2048);
                var one = new byte[1];
                while (headerBytes.Count < 32768)
                {
                    var read = await stream.ReadAsync(one, ct);
                    if (read == 0) return;
                    headerBytes.Add(one[0]);
                    var n = headerBytes.Count;
                    if (n >= 4 && headerBytes[n - 4] == 13 && headerBytes[n - 3] == 10 && headerBytes[n - 2] == 13 && headerBytes[n - 1] == 10) break;
                }
                var headerText = Encoding.ASCII.GetString(headerBytes.ToArray());
                var lines = headerText.Split("\r\n", StringSplitOptions.None);
                var request = lines[0].Split(' ', StringSplitOptions.RemoveEmptyEntries);
                if (request.Length < 2) { await Respond(stream, 400, new { ok = false, error = "Requisição inválida." }, null); return; }
                var method = request[0];
                var path = request[1].Split('?')[0];
                var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                foreach (var line in lines.Skip(1))
                {
                    var colon = line.IndexOf(':');
                    if (colon > 0) headers[line[..colon].Trim()] = line[(colon + 1)..].Trim();
                }
                headers.TryGetValue("Origin", out var origin);
                var allowedOrigin = origin == "https://fb3d2ymenu.com.br" || origin == "https://www.fb3d2ymenu.com.br" ? origin : null;

                if (method == "OPTIONS")
                {
                    await Respond(stream, 204, null, allowedOrigin);
                    return;
                }

                if (method == "GET" && path == "/health")
                {
                    await Respond(stream, 200, new { ok = true, app = "Fb3d2y Print", version = "0.1.0", printer = printer() }, allowedOrigin);
                    return;
                }

                if (method != "POST" || path != "/print")
                {
                    await Respond(stream, 404, new { ok = false, error = "Rota não encontrada." }, allowedOrigin);
                    return;
                }

                headers.TryGetValue("Authorization", out var authorization);
                if (!string.Equals(authorization, "Bearer " + token, StringComparison.Ordinal))
                {
                    await Respond(stream, 401, new { ok = false, error = "Código de conexão inválido." }, allowedOrigin);
                    return;
                }

                var contentLength = headers.TryGetValue("Content-Length", out var lengthText) && int.TryParse(lengthText, out var parsed) ? Math.Clamp(parsed, 0, 2_000_000) : 0;
                var bodyBytes = new byte[contentLength];
                var offset = 0;
                while (offset < contentLength)
                {
                    var count = await stream.ReadAsync(bodyBytes.AsMemory(offset, contentLength - offset), ct);
                    if (count == 0) throw new IOException("Conexão encerrada antes do fim do conteúdo.");
                    offset += count;
                }
                var payload = JsonSerializer.Deserialize<PrintPayload>(bodyBytes, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                if (payload is null || string.IsNullOrWhiteSpace(payload.Content))
                {
                    await Respond(stream, 400, new { ok = false, error = "Comanda vazia." }, allowedOrigin);
                    return;
                }
                var selectedPrinter = string.IsNullOrWhiteSpace(payload.Printer) ? printer() : payload.Printer;
                if (string.IsNullOrWhiteSpace(selectedPrinter))
                {
                    await Respond(stream, 400, new { ok = false, error = "Selecione uma impressora no Fb3d2y Print." }, allowedOrigin);
                    return;
                }
                if (!RawPrinter.Send(selectedPrinter, payload.Content, "Fb3d2y Menu"))
                {
                    await Respond(stream, 500, new { ok = false, error = "O Windows não conseguiu enviar a impressão. Confira a impressora." }, allowedOrigin);
                    return;
                }
                await Respond(stream, 200, new { ok = true, printer = selectedPrinter }, allowedOrigin);
            }
            catch (Exception ex)
            {
                try { await Respond(stream, 500, new { ok = false, error = ex.Message }, null); } catch { }
            }
        }
    }

    private static async Task Respond(NetworkStream stream, int status, object? data, string? origin)
    {
        var body = data is null ? Array.Empty<byte>() : Encoding.UTF8.GetBytes(JsonSerializer.Serialize(data));
        var reason = status switch { 200 => "OK", 204 => "No Content", 400 => "Bad Request", 401 => "Unauthorized", 404 => "Not Found", _ => "Internal Server Error" };
        var headers = new StringBuilder()
            .Append("HTTP/1.1 ").Append(status).Append(' ').Append(reason).Append("\r\n")
            .Append("Content-Type: application/json; charset=utf-8\r\n")
            .Append("Content-Length: ").Append(body.Length).Append("\r\n")
            .Append("Connection: close\r\n");
        if (origin is not null)
        {
            headers.Append("Access-Control-Allow-Origin: ").Append(origin).Append("\r\n")
                .Append("Vary: Origin\r\n")
                .Append("Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n")
                .Append("Access-Control-Allow-Headers: Content-Type, Authorization\r\n")
                .Append("Access-Control-Allow-Private-Network: true\r\n");
        }
        headers.Append("\r\n");
        var head = Encoding.ASCII.GetBytes(headers.ToString());
        await stream.WriteAsync(head);
        if (body.Length > 0) await stream.WriteAsync(body);
    }

    public void Dispose()
    {
        try { cancellation?.Cancel(); listener.Stop(); } catch { }
        cancellation?.Dispose();
    }

    private sealed class PrintPayload
    {
        public string? Printer { get; set; }
        public string? Content { get; set; }
    }
}
