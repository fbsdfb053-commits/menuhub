using System.Runtime.InteropServices;
using System.Text;

namespace Fb3d2yPrint;

internal static class RawPrinter
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private sealed class DOC_INFO_1
    {
        public string pDocName = "Fb3d2y Menu";
        public string? pOutputFile;
        public string pDatatype = "RAW";
    }

    [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool OpenPrinter(string printerName, out IntPtr printer, IntPtr defaults);
    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool ClosePrinter(IntPtr printer);
    [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern int StartDocPrinter(IntPtr printer, int level, [In] DOC_INFO_1 info);
    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool EndDocPrinter(IntPtr printer);
    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool StartPagePrinter(IntPtr printer);
    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool EndPagePrinter(IntPtr printer);
    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool WritePrinter(IntPtr printer, IntPtr bytes, int count, out int written);

    public static bool Send(string printerName, string text, string jobName)
    {
        if (!OpenPrinter(printerName, out var handle, IntPtr.Zero)) return false;
        var started = false;
        try
        {
            var info = new DOC_INFO_1 { pDocName = jobName };
            if (StartDocPrinter(handle, 1, info) == 0) return false;
            started = true;
            if (!StartPagePrinter(handle)) return false;
            var bytes = Encoding.Latin1.GetBytes(text);
            var pointer = Marshal.AllocHGlobal(bytes.Length);
            try
            {
                Marshal.Copy(bytes, 0, pointer, bytes.Length);
                return WritePrinter(handle, pointer, bytes.Length, out var written) && written == bytes.Length;
            }
            finally { Marshal.FreeHGlobal(pointer); }
        }
        finally
        {
            if (started) { EndPagePrinter(handle); EndDocPrinter(handle); }
            ClosePrinter(handle);
        }
    }
}
