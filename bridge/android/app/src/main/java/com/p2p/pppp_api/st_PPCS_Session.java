package com.p2p.pppp_api;

public class st_PPCS_Session {
    int Skt = -1;
    byte[] RemoteIP = new byte[16];
    int RemotePort = 0;
    byte[] MyLocalIP = new byte[16];
    int MyLocalPort = 0;
    byte[] MyWanIP = new byte[16];
    int MyWanPort = 0;
    int ConnectTime = 0;
    byte[] DID = new byte[24];
    byte bCorD = 0;
    byte bMode = 0;

    private static String bytesToString(byte[] bytes) {
        int length = 0;
        while (length < bytes.length && bytes[length] != 0) {
            length++;
        }
        return length == 0 ? "" : new String(bytes, 0, length);
    }

    public int getSkt() {
        return Skt;
    }

    public String getRemoteIP() {
        return bytesToString(RemoteIP);
    }

    public int getRemotePort() {
        return RemotePort;
    }

    public String getMyLocalIP() {
        return bytesToString(MyLocalIP);
    }

    public int getMyLocalPort() {
        return MyLocalPort;
    }

    public String getMyWanIP() {
        return bytesToString(MyWanIP);
    }

    public int getMyWanPort() {
        return MyWanPort;
    }

    public int getConnectTime() {
        return ConnectTime;
    }

    public String getDID() {
        return bytesToString(DID);
    }

    public int getCorD() {
        return bCorD & 255;
    }

    public int getMode() {
        return bMode & 255;
    }
}
