using System.Drawing.Printing;
using System.Security.Cryptography;
using System.Text;

namespace Fb3d2yPrint;

internal sealed class MainForm : Form
{
    private readonly ComboBox printers = new() { DropDownStyle = ComboBoxStyle.DropDownList, Dock = DockStyle.Fill };
    private readonly TextBox tokenBox = new() { ReadOnly = true, Dock = DockStyle.Fill };
    private readonly Label status = new() { AutoSize = true, Text = "Iniciando terminal…" };
    private readonly NotifyIcon tray;
    private readonly PrintServer server;
    private readonly string token;
    private bool exiting;

    public MainForm()
    {
        Text = "Fb3d2y Print";
        ClientSize = new Size(640, 390);
        MinimumSize = new Size(580, 360);
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.Sizable;
        MaximizeBox = true;
        MinimizeBox = true;
        BackColor = Color.White;
        Font = new Font("Segoe UI", 10);
        AutoScaleMode = AutoScaleMode.Font;

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

        var title = new Label
        {
            Text = "FB3D2Y PRINT",
            Font = new Font("Segoe UI", 18, FontStyle.Bold),
            AutoSize = true,
            ForeColor = Color.FromArgb(230, 103, 32),
            Margin = new Padding(0, 0, 0, 2)
        };
        var subtitle = new Label
        {
            Text = "Terminal de impressão automática do Fb3d2y Menu",
            AutoSize = true,
            Margin = new Padding(0, 0, 0, 12)
        };
        var printerLabel = new Label { Text = "Impressora do Windows", AutoSize = true, Margin = new Padding(0, 4, 0, 4) };
        var tokenLabel = new Label
        {
            Text = "Código de conexão (cole nas configurações do site)",
            AutoSize = true,
            Margin = new Padding(0, 12, 0, 4)
        };

        printers.Margin = new Padding(0, 0, 8, 0);
        var refresh = new Button { Text = "Atualizar", AutoSize = true, MinimumSize = new Size(96, 34), Dock = DockStyle.Fill };
        refresh.Click += (_, _) => LoadPrinters();

        tokenBox.Margin = new Padding(0, 0, 8, 0);
        tokenBox.Text = token;
        var copy = new Button { Text = "Copiar", AutoSize = true, MinimumSize = new Size(96, 34), Dock = DockStyle.Fill };
        copy.Click += (_, _) => { Clipboard.SetText(token); status.Text = "Código copiado."; };

        var test = new Button
        {
            Text = "Imprimir teste",
            AutoSize = true,
            MinimumSize = new Size(150, 38),
            BackColor = Color.FromArgb(230, 103, 32),
            ForeColor = Color.White,
            FlatStyle = FlatStyle.Flat,
            Margin = new Padding(0, 0, 14, 0)
        };
        test.FlatAppearance.BorderSize = 0;
        test.Click += (_, _) => TestPrint();

        var actions = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            AutoSize = true,
            WrapContents = true,
            FlowDirection = FlowDirection.LeftToRight,
            Margin = new Padding(0, 16, 0, 0),
            Padding = new Padding(0)
        };
        actions.Controls.Add(test);
        actions.Controls.Add(status);

        var layout = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(24),
            ColumnCount = 2,
            RowCount = 7,
            AutoSize = false
        };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        for (var i = 0; i < 6; i++) layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        layout.Controls.Add(title, 0, 0);
        layout.SetColumnSpan(title, 2);
        layout.Controls.Add(subtitle, 0, 1);
        layout.SetColumnSpan(subtitle, 2);
        layout.Controls.Add(printerLabel, 0, 2);
        layout.SetColumnSpan(printerLabel, 2);
        layout.Controls.Add(printers, 0, 3);
        layout.Controls.Add(refresh, 1, 3);
        layout.Controls.Add(tokenLabel, 0, 4);
        layout.SetColumnSpan(tokenLabel, 2);
        layout.Controls.Add(tokenBox, 0, 5);
        layout.Controls.Add(copy, 1, 5);
        layout.Controls.Add(actions, 0, 6);
        layout.SetColumnSpan(actions, 2);

        Controls.Add(layout);
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
        var receipt = "\\u001B@\\u001Ba\\x01\\u001BE\\x01FB3D2Y MENU\\n\\u001BE\\x00\\nTESTE DE IMPRESSAO\\nConexao funcionando!\\nPapel: 50 mm\\n\\n\\n\\u001DV\\x00";
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
        Show();
        if (WindowState == FormWindowState.Minimized) WindowState = FormWindowState.Normal;
        Activate();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) { server.Dispose(); tray.Visible = false; tray.Dispose(); }
        base.Dispose(disposing);
    }
}
