package com.v360pro.camcar.bridge;

import android.app.Activity;
import android.os.Bundle;
import android.util.Base64;
import android.content.Intent;
import android.net.Uri;
import android.widget.TextView;
import android.widget.Button;
import android.widget.LinearLayout;
import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import com.p2p.pppp_api.PPCS_APIs;
import com.p2p.pppp_api.st_PPCS_Session;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
    private static final int MAX_READ_SIZE = 8 * 1024 * 1024;
    private BridgeServer bridgeServer;
    private TextView statusView;

    private static final int PICK_V360_APK = 607;

    @Override
    protected void onCreate(Bundle bundle) {
        super.onCreate(bundle);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(32, 40, 32, 32);
        statusView = new TextView(this);
        statusView.setTextSize(16);
        statusView.setText("SENTINELA AI · PPCS BRIDGE\n\nSelecione o APK original do V360 Pro para extrair a biblioteca nativa no próprio aparelho.");
        statusView.setPadding(0, 0, 0, 28);
        Button pick = new Button(this);
        pick.setText("Selecionar APK do V360 Pro");
        pick.setOnClickListener(v -> {
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("*/*");
            startActivityForResult(intent, PICK_V360_APK);
        });
        root.addView(statusView, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        root.addView(pick, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        setContentView(root);

        File nativeFile = new File(getFilesDir(), "libPPCS_API.so");
        if (nativeFile.isFile() && nativeFile.length() > 0) {
            loadNativeLibraryAndStartBridge(nativeFile);
        } else {
            setStatus("Aguardando APK V360 Pro.\n\nToque em “Selecionar APK do V360 Pro”. A biblioteca será extraída para o armazenamento privado deste app. Nenhum arquivo será enviado para a internet.");
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != PICK_V360_APK || resultCode != RESULT_OK || data == null || data.getData() == null) {
            return;
        }
        File target = new File(getFilesDir(), "libPPCS_API.so");
        try (InputStream input = getContentResolver().openInputStream(data.getData());
             ZipInputStream zip = new ZipInputStream(new BufferedInputStream(input))) {
            if (input == null) {
                setStatus("Não foi possível abrir o arquivo selecionado.");
                return;
            }
            ZipEntry entry;
            boolean extracted = false;
            byte[] buffer = new byte[8192];
            while ((entry = zip.getNextEntry()) != null) {
                if ("lib/arm64-v8a/libPPCS_API.so".equals(entry.getName())) {
                    try (FileOutputStream output = new FileOutputStream(target)) {
                        int read;
                        long total = 0;
                        while ((read = zip.read(buffer)) != -1) {
                            total += read;
                            if (total > 16L * 1024L * 1024L) {
                                throw new IllegalStateException("Biblioteca excede o limite esperado.");
                            }
                            output.write(buffer, 0, read);
                        }
                    }
                    extracted = true;
                    break;
                }
                zip.closeEntry();
            }
            if (!extracted || target.length() < 4096) {
                target.delete();
                setStatus("Biblioteca ARM64 não encontrada no APK. Selecione o V360 Pro original que contém lib/arm64-v8a/libPPCS_API.so.");
                return;
            }
            loadNativeLibraryAndStartBridge(target);
        } catch (Exception exception) {
            target.delete();
            setStatus("Falha ao extrair a biblioteca: " + exception);
        }
    }

    private void loadNativeLibraryAndStartBridge(File library) {
        try {
            System.setProperty("sentinela.ppcs.library", library.getAbsolutePath());
            Class.forName("com.p2p.pppp_api.PPCS_APIs", true, getClassLoader());
            if (bridgeServer == null) {
                bridgeServer = new BridgeServer(8766, this::setStatus);
                bridgeServer.start();
            }
            setStatus("Biblioteca V360 carregada.\n\nPPCS Bridge ativo em 127.0.0.1:8766.\nMantenha este app aberto enquanto o SENTINELA AI estiver conectado.");
        } catch (Throwable error) {
            setStatus("Falha ao carregar libPPCS_API.so: " + error + "\n\nConfirme que o APK é ARM64 e corresponde ao V360 Pro instalado.");
        }
    }

    @Override
    protected void onDestroy() {
        if (bridgeServer != null) {
            bridgeServer.shutdown();
        }
        super.onDestroy();
    }

    private void setStatus(String status) {
        runOnUiThread(() -> statusView.setText(status));
    }

    interface StatusSink {
        void setStatus(String status);
    }

    static class BridgeServer extends Thread {
        private final int port;
        private final StatusSink statusSink;
        private volatile boolean running = true;
        private ServerSocket serverSocket;

        BridgeServer(int port, StatusSink statusSink) {
            super("v360-ppcs-bridge");
            this.port = port;
            this.statusSink = statusSink;
        }

        @Override
        public void run() {
            try {
                serverSocket = new ServerSocket(port, 50, InetAddress.getByName("127.0.0.1"));
                statusSink.setStatus("Sentinela PPCS bridge listening on 127.0.0.1:" + port);
                while (running) {
                    Socket socket = serverSocket.accept();
                    new Thread(() -> handle(socket), "v360-ppcs-request").start();
                }
            } catch (Exception exception) {
                if (running) {
                    statusSink.setStatus("V360 PPCS bridge stopped: " + exception);
                }
            }
        }

        void shutdown() {
            running = false;
            try {
                if (serverSocket != null) {
                    serverSocket.close();
                }
            } catch (Exception ignored) {
            }
        }

        private void handle(Socket socket) {
            try (Socket closeable = socket;
                 BufferedReader reader = new BufferedReader(new InputStreamReader(closeable.getInputStream(), StandardCharsets.UTF_8));
                 BufferedWriter writer = new BufferedWriter(new OutputStreamWriter(closeable.getOutputStream(), StandardCharsets.UTF_8))) {
                JSONObject request = new JSONObject(reader.readLine());
                JSONObject response = dispatch(request);
                writer.write(response.toString());
                writer.write("\n");
                writer.flush();
            } catch (Exception ignored) {
            }
        }

        private JSONObject dispatch(JSONObject request) {
            try {
                String op = request.getString("op");
                if ("init".equals(op)) {
                    return init(request);
                }
                if ("connect".equals(op)) {
                    return connect(request);
                }
                if ("check".equals(op)) {
                    return check(request);
                }
                if ("write".equals(op)) {
                    return write(request);
                }
                if ("read".equals(op)) {
                    return read(request);
                }
                if ("close".equals(op)) {
                    return close(request);
                }
                if ("api_info".equals(op)) {
                    return ok().put("version", PPCS_APIs.PPCS_GetAPIVersion()).put("info", PPCS_APIs.PPCS_GetAPIInformation());
                }
                return error("unknown op: " + op);
            } catch (Exception exception) {
                return error(exception.toString());
            }
        }

        private JSONObject init(JSONObject request) throws Exception {
            String initKey = request.getString("init_key");
            if (!initKey.endsWith("\u0000")) {
                initKey += "\u0000";
            }
            int ret = PPCS_APIs.PPCS_Initialize(initKey.getBytes(StandardCharsets.UTF_8));
            if (ret < 0 && ret != -2) {
                return error("PPCS_Initialize failed: " + ret).put("ret", ret);
            }
            return ok().put("ret", ret);
        }

        private JSONObject connect(JSONObject request) throws Exception {
            String did = request.getString("did");
            byte connectMode = (byte) request.optInt("connect_mode", 126);
            int timeout = request.optInt("timeout", 0);
            String serverKey = request.optString("server_key", "");
            int session = serverKey.length() == 0
                    ? PPCS_APIs.PPCS_Connect(did, connectMode, timeout)
                    : PPCS_APIs.PPCS_ConnectByServer(did, connectMode, timeout, serverKey);
            if (session < 0) {
                return error("PPCS connect failed: " + session).put("ret", session);
            }
            st_PPCS_Session info = new st_PPCS_Session();
            int checkRet = PPCS_APIs.PPCS_Check(session, info);
            JSONObject response = ok().put("session", session).put("check_ret", checkRet);
            if (checkRet >= 0) {
                response.put("status", sessionInfo(info).put("ret", checkRet));
            }
            return response;
        }

        private JSONObject check(JSONObject request) throws Exception {
            int session = request.getInt("session");
            st_PPCS_Session info = new st_PPCS_Session();
            int ret = PPCS_APIs.PPCS_Check(session, info);
            if (ret < 0) {
                return error("PPCS_Check failed: " + ret).put("ret", ret);
            }
            JSONObject status = sessionInfo(info);
            status.put("ret", ret);
            return ok().put("status", status);
        }

        private JSONObject sessionInfo(st_PPCS_Session info) throws Exception {
            JSONObject status = new JSONObject();
            status.put("skt", info.getSkt());
            status.put("remote_ip", info.getRemoteIP());
            status.put("remote_port", info.getRemotePort());
            status.put("local_ip", info.getMyLocalIP());
            status.put("local_port", info.getMyLocalPort());
            status.put("wan_ip", info.getMyWanIP());
            status.put("wan_port", info.getMyWanPort());
            status.put("connect_time", info.getConnectTime());
            status.put("did", info.getDID());
            status.put("mode", info.getMode());
            return status;
        }

        private JSONObject write(JSONObject request) throws Exception {
            int session = request.getInt("session");
            byte channel = (byte) request.getInt("channel");
            byte[] data = Base64.decode(request.getString("data"), Base64.DEFAULT);
            int ret = PPCS_APIs.PPCS_Write(session, channel, data, data.length);
            if (ret < 0) {
                return error("PPCS_Write failed: " + ret).put("ret", ret);
            }
            return ok().put("written", ret);
        }

        private JSONObject read(JSONObject request) throws Exception {
            int session = request.getInt("session");
            byte channel = (byte) request.getInt("channel");
            int size = request.getInt("size");
            if (size < 0 || size > MAX_READ_SIZE) {
                return error("PPCS_Read size out of range: " + size).put("ret", -22);
            }
            int timeoutMs = request.optInt("timeout_ms", 10000);
            byte[] buffer = new byte[size];
            int[] actualSize = new int[]{size};
            int ret = PPCS_APIs.PPCS_Read(session, channel, buffer, actualSize, timeoutMs);
            if (ret < 0) {
                return error("PPCS_Read failed: " + ret).put("ret", ret);
            }
            int length = Math.max(0, Math.min(actualSize[0], buffer.length));
            byte[] actual = new byte[length];
            System.arraycopy(buffer, 0, actual, 0, length);
            return ok()
                    .put("ret", ret)
                    .put("data", Base64.encodeToString(actual, Base64.NO_WRAP));
        }

        private JSONObject close(JSONObject request) throws Exception {
            int session = request.getInt("session");
            int ret = PPCS_APIs.PPCS_Close(session);
            return ok().put("ret", ret);
        }

        private static JSONObject ok() throws Exception {
            return new JSONObject().put("ok", true);
        }

        private static JSONObject error(String message) {
            try {
                return new JSONObject().put("ok", false).put("error", message);
            } catch (Exception exception) {
                return new JSONObject();
            }
        }
    }
}
