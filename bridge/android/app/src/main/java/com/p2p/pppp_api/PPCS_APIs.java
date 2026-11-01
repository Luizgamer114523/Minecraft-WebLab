package com.p2p.pppp_api;

public class PPCS_APIs {
    public static native int PPCS_Initialize(byte[] initParams);

    public static native int PPCS_DeInitialize();

    public static native int PPCS_Connect(String did, byte connectMode, int timeout);

    public static native int PPCS_ConnectByServer(String did, byte connectMode, int timeout, String serverString);

    public static native int PPCS_Check(int session, st_PPCS_Session info);

    public static native int PPCS_Read(int session, byte channel, byte[] buffer, int[] size, int timeoutMs);

    public static native int PPCS_Write(int session, byte channel, byte[] buffer, int size);

    public static native int PPCS_Close(int session);

    public static native int PPCS_ForceClose(int session);

    public static native String PPCS_GetAPIInformation();

    public static native int PPCS_GetAPIVersion();

    static {
        String extractedLibrary = System.getProperty("sentinela.ppcs.library");
        if (extractedLibrary != null && !extractedLibrary.isEmpty()) {
            System.load(extractedLibrary);
        } else {
            System.loadLibrary("PPCS_API");
        }
    }
}
