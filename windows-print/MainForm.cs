using System.Drawing.Printing;
using System.Security.Cryptography;
using System.Text;

namespace Fb3d2yPrint;

internal sealed class MainForm : Form
{
    private readonly ComboBox printers = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 360 };
    private readonly TextBox tokenBox = new() { ReadOnly = true, Width = 360 };
    private readonly Label status = new() { AutoSize = true, Text = "Iniciando terminal…" };
    private readonly NotifyIcon tray;
    private readonly PrintServer server;
    private readonly string token;
    private bool exiting;

    public MainForm()
    {
        Text = "Fb3d2y Print";
        Width = 520; Height = 330;
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        BackColor = Color.White;
        Font = new Font("Segoe UI", 10);

        token = LoadOrCreateToken();
        server = new PrintServer(token, () => printers.SelectedItem?.ToString() ?? "");
        tray = new NotifyIcon
        {
            Icon = SystemIcons.Application,
            Text = "Fb3d2y Print — ativo",
            Visible = true,
            ContextMenuStrip = new ContextMenuStrip()
        };
        tray.ContextMenuStrip.Items.Add("Abrir Fb3d2y Print", null, (_, _) => ShowWindow());
        tray.ContextMenuStrip.Items.Add("Sair", null, (_, _) => { exiting = true; Close(); });
        tray.DoubleClick += (_, _) => ShowWindow();

        var title = new Label { Text = "FB3D2Y PRINT", Font = new Font("Segoe UI", 18, FontStyle.Bold), AutoSize = true, ForeColor = Color.FromArgb(230, 103, 32), Location = new Point(24, 20) };
        var subtitle = new Label { Text = "Terminal de impressão automática do Fb3d2y Menu", AutoSize = true, Location = new Point(26, 58) };
        var printerLabel = new Label { Text = "Impressora do Windows", AutoSize = true, Location = new Point(26, 100) };
        printers.Location = new Point(26, 124);
        var refresh = new Button { Text = "Atualizar", Location = new Point(394, 122), Width = 90 };
        refresh.Click += (_, _) => LoadPrinters();
        var tokenLabel = new Label { Text = "Código de conexão (cole nas configurações do site)", AutoSize = true, Location = new Point(26, 170) };
        tokenBox.Location = new Point(26, 194);
        var copy = new Button { Text = "Copiar", Location = new Point(394, 192), Width = 90 };
        copy.Click += (_, _) => { Clipboard.SetText(token); status.Text = "Código copiado."; };
        var test = new Button { Text = "Imprimir teste", Location = new Point(26, 238), Width = 150, Height = 34, BackColor = Color.FromArgb(230, 103, 32), ForeColor = Color.White, FlatStyle = FlatStyle.Flat };
        test.Click += (_, _) => TestPrint();
        status.Location = new Point(190, 247);

        Controls.AddRange([title, subtitle, printerLabel, printers, refresh, tokenLabel, tokenBox, copy, test, status]);
        tokenBox.Text = token;
        LoadPrinters();
        server.Start();
        status.Text = "Terminal ativo — aguardando conexão do site.";
        FormClosing += (_, e) =>
        {
            if (!exiting && e.CloseReason == CloseReason.UserClosing)
            {
                e.Cancel = true;
                Hide();
            }
        };
        tray.Visible = true;
    }

    private void LoadPrinters()
    {
        var current = printers.SelectedItem?.ToString();
        printers.Items.Clear();
        foreach (string name in PrinterSettings.InstalledPrinters) printers.Items.Add(name);
        if (current is not null && printers.Items.Contains(current)) printers.SelectedItem = current;
        else if (printers.Items.Count > 0) printers.SelectedIndex = 0;
        status.Text = printers.Items.Count > 0 ? "Impressora encontrada." : "Nenhuma impressora instalada no Windows.";
    }

    private void TestPrint()
    {
        var printer = printers.SelectedItem?.ToString();
        if (string.IsNullOrWhiteSpace(printer)) { status.Text = "Selecione uma impressora."; return; }
        var receipt = "\u001B@\u001Ba\x01\u001BE\x01FB3D2Y MENU\n\u001BE\x00\nTESTE DE IMPRESSAO\nConexao funcionando!\nPapel: 50 mm\n\n\n\u001DV\x00";
        if (RawPrinter.Send(printer, receipt, "Teste Fb3d2y Print")) status.Text = "Teste enviado para a impressora.";
        else status.Text = "Falha no teste. Confira a fila do Windows.";
    }

    private static string LoadOrCreateToken()
    {
        var directory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Fb3d2yPrint");
        Directory.CreateDirectory(directory);
        var path = Path.Combine(directory, "connection.key");
        if (File.Exists(path)) return File.ReadAllText(path).Trim();
        var value = Convert.ToHexString(RandomNumberGenerator.GetBytes(24)).ToLowerInvariant();
        File.WriteAllText(path, value, Encoding.UTF8);
        return value;
    }

    private void ShowWindow()
    {
        Show(); WindowState = FormWindowState.Normal; Activate();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) { server.Dispose(); tray.Visible = false; tray.Dispose(); }
        base.Dispose(disposing);
    }
}
