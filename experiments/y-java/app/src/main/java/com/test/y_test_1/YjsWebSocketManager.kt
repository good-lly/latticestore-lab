package com.test.y_test_1

import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okhttp3.logging.HttpLoggingInterceptor
import org.json.JSONObject
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

/**
 * Singleton WebSocket manager for Yjs synchronization
 * Handles connection, reconnection, and message passing similar to Yjs WebsocketProvider
 */
object YjsWebSocketManager {

    private const val WS_BASE_URL = "wss://yjs-provider-test-1.jensenwtfwtf.workers.dev/yjs/ws"
    private const val RESYNC_INTERVAL = 5000L // milliseconds
    private const val MAX_BACKOFF_TIME = 2500L // milliseconds
    private const val INITIAL_BACKOFF = 100L // milliseconds

    private val okHttpClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .pingInterval(30, TimeUnit.SECONDS)
            .readTimeout(0, TimeUnit.SECONDS)
            .connectTimeout(10, TimeUnit.SECONDS)
            .addInterceptor(HttpLoggingInterceptor().apply {
                level = HttpLoggingInterceptor.Level.BODY
            })
            .build()
    }

    private var webSocket: WebSocket? = null
    private var currentRoomId: String? = null
    private val isConnected = AtomicBoolean(false)
    private val isSynced = AtomicBoolean(false)
    private val reconnectAttempts = AtomicInteger(0)
    private var reconnectJob: Job? = null
    private val coroutineScope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    // Event listeners
    private val statusListeners = mutableListOf<(ConnectionStatus) -> Unit>()
    private val syncListeners = mutableListOf<(Boolean) -> Unit>()
    private val messageListeners = mutableListOf<(ByteArray) -> Unit>()
    private val errorListeners = mutableListOf<(Exception) -> Unit>()
    private val closeListeners = mutableListOf<(Int, String?) -> Unit>()

    enum class ConnectionStatus {
        CONNECTING,
        CONNECTED,
        DISCONNECTED,
        ERROR
    }

    /**
     * Connect to WebSocket with specified room ID
     */
    fun connect(roomId: String, params: Map<String, String> = emptyMap()) {
        disconnect() // Ensure previous connection is closed

        currentRoomId = roomId
        reconnectAttempts.set(0)

        val urlBuilder = StringBuilder(WS_BASE_URL)
        urlBuilder.append("/").append(roomId)
        params.forEach { (key, value) ->
            urlBuilder.append("&").append(key).append("=").append(value)
        }
        Log.i("socket:::URL:", urlBuilder.toString())
        val request = Request.Builder()
            .url(urlBuilder.toString())
            .build()

        notifyStatusListeners(ConnectionStatus.CONNECTING)

        webSocket = okHttpClient.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                isConnected.set(true)
                reconnectAttempts.set(0)
                notifyStatusListeners(ConnectionStatus.CONNECTED)

                // Start resync timer
                startResyncTimer()
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                handleTextMessage(text)
            }

            override fun onMessage(webSocket: WebSocket, bytes: okio.ByteString) {
                handleBinaryMessage(bytes.toByteArray())
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                isConnected.set(false)
                isSynced.set(false)
                notifyStatusListeners(ConnectionStatus.ERROR)
                notifyErrorListeners(Exception("WebSocket connection error", t))

                scheduleReconnect()
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                isConnected.set(false)
                isSynced.set(false)
                notifyStatusListeners(ConnectionStatus.DISCONNECTED)
                notifyCloseListeners(code, reason)

                if (currentRoomId != null) {
                    scheduleReconnect()
                }
            }
        })
    }

    /**
     * Send binary message through WebSocket
     */
    fun sendBinary(data: ByteArray): Boolean {
        return webSocket?.send(okio.ByteString.of(*data)) ?: false
    }

    /**
     * Send text message through WebSocket
     */
    fun sendText(message: String): Boolean {
        return webSocket?.send(message) ?: false
    }

    /**
     * Send JSON message through WebSocket
     */
    fun sendJson(json: JSONObject): Boolean {
        return sendText(json.toString())
    }

    /**
     * Disconnect WebSocket and cleanup
     */
    fun disconnect() {
        currentRoomId = null
        reconnectJob?.cancel()
        webSocket?.close(1000, "Client disconnect")
        webSocket = null
        isConnected.set(false)
        isSynced.set(false)
    }

    /**
     * Register status change listener
     */
    fun onStatus(listener: (ConnectionStatus) -> Unit) {
        statusListeners.add(listener)
    }

    /**
     * Register sync status listener
     */
    fun onSynced(listener: (Boolean) -> Unit) {
        syncListeners.add(listener)
    }

    /**
     * Register message listener for binary data
     */
    fun onMessage(listener: (ByteArray) -> Unit) {
        messageListeners.add(listener)
    }

    /**
     * Register error listener
     */
    fun onError(listener: (Exception) -> Unit) {
        errorListeners.add(listener)
    }

    /**
     * Register close listener
     */
    fun onClose(listener: (Int, String?) -> Unit) {
        closeListeners.add(listener)
    }

    /**
     * Remove all listeners
     */
    fun clearListeners() {
        statusListeners.clear()
        syncListeners.clear()
        messageListeners.clear()
        errorListeners.clear()
        closeListeners.clear()
    }

    /**
     * Get current connection status
     */
    fun isConnected(): Boolean = isConnected.get()

    /**
     * Get current sync status
     */
    fun isSynced(): Boolean = isSynced.get()

    /**
     * Get current room ID
     */
    fun getCurrentRoomId(): String? = currentRoomId

    // Private helper methods

    private fun handleTextMessage(text: String) {
        try {
            val json = JSONObject(text)
            when (json.optString("type")) {
                "sync" -> {
                    val synced = json.optBoolean("synced", false)
                    isSynced.set(synced)
                    notifySyncListeners(synced)
                }
                "ping" -> {
                    // Respond with pong
                    sendJson(JSONObject().apply {
                        put("type", "pong")
                    })
                }
                // Handle other message types as needed
            }
        } catch (e: Exception) {
            // If not JSON, treat as regular text message
            // You might want to handle this differently based on your protocol
        }
    }

    private fun handleBinaryMessage(bytes: ByteArray) {
        // Handle Yjs binary protocol messages
        notifyMessageListeners(bytes)

        // Check for sync messages in binary format
        // This depends on your Yjs protocol implementation
        checkForSyncInBinary(bytes)
    }

    private fun checkForSyncInBinary(bytes: ByteArray) {
        // Implement based on your Yjs protocol
        // This is a placeholder - adjust based on actual protocol
        if (bytes.isNotEmpty() && bytes[0].toInt() == 0x00) {
            // Sync step 1 received
            isSynced.set(false)
            notifySyncListeners(false)
        } else if (bytes.isNotEmpty() && bytes[0].toInt() == 0x01) {
            // Sync step 2 - we're synced
            isSynced.set(true)
            notifySyncListeners(true)
        }
    }

    private fun startResyncTimer() {
        coroutineScope.launch {
            while (isConnected.get()) {
                delay(RESYNC_INTERVAL)
                if (isConnected.get()) {
                    // Send resync request
                    sendJson(JSONObject().apply {
                        put("type", "resync")
                        put("timestamp", System.currentTimeMillis())
                    })
                }
            }
        }
    }

    private fun scheduleReconnect() {
        reconnectJob?.cancel()

        val roomId = currentRoomId ?: return

        reconnectJob = coroutineScope.launch {
            val attempts = reconnectAttempts.incrementAndGet()
            val backoffTime = minOf(
                INITIAL_BACKOFF * (1 shl (attempts - 1)),
                MAX_BACKOFF_TIME
            )

            delay(backoffTime)

            if (currentRoomId == roomId && !isConnected.get()) {
                connect(roomId)
            }
        }
    }

    private fun notifyStatusListeners(status: ConnectionStatus) {
        coroutineScope.launch(Dispatchers.Main) {
            statusListeners.forEach { it(status) }
        }
    }

    private fun notifySyncListeners(synced: Boolean) {
        coroutineScope.launch(Dispatchers.Main) {
            syncListeners.forEach { it(synced) }
        }
    }

    private fun notifyMessageListeners(data: ByteArray) {
        coroutineScope.launch(Dispatchers.Main) {
            messageListeners.forEach { it(data) }
        }
    }

    private fun notifyErrorListeners(error: Exception) {
        coroutineScope.launch(Dispatchers.Main) {
            errorListeners.forEach { it(error) }
        }
    }

    private fun notifyCloseListeners(code: Int, reason: String?) {
        coroutineScope.launch(Dispatchers.Main) {
            closeListeners.forEach { it(code, reason) }
        }
    }
}

/**
 * Extension functions for easier usage
 */
fun YjsWebSocketManager.connectWithCallbacks(
    roomId: String,
    onConnected: () -> Unit = {},
    onSynced: () -> Unit = {},
    onError: (Exception) -> Unit = {},
    onDisconnected: () -> Unit = {}
) {
    clearListeners()

    onStatus { status ->
        when (status) {
            YjsWebSocketManager.ConnectionStatus.CONNECTED -> onConnected()
            YjsWebSocketManager.ConnectionStatus.DISCONNECTED -> onDisconnected()
            YjsWebSocketManager.ConnectionStatus.ERROR -> {}
            YjsWebSocketManager.ConnectionStatus.CONNECTING -> {}
        }
    }

    onSynced { synced ->
        if (synced) onSynced()
    }

    onError { error ->
        onError(error)
    }

    connect(roomId)
}

// Usage example in an Activity or ViewModel:
/*
class MainActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val roomId = "my-room-123"

        // Setup listeners
        YjsWebSocketManager.onStatus { status ->
            runOnUiThread {
                when (status) {
                    ConnectionStatus.CONNECTED -> {
                        updateConnectionStatus("Connected", true)
                        addDebugLog("WebSocket status: connected", "success")
                    }
                    ConnectionStatus.CONNECTING -> {
                        updateConnectionStatus("Connecting...", false)
                        addDebugLog("WebSocket status: connecting", "info")
                    }
                    ConnectionStatus.DISCONNECTED -> {
                        updateConnectionStatus("Disconnected", false)
                        addDebugLog("WebSocket connection closed", "error")
                    }
                    ConnectionStatus.ERROR -> {
                        addDebugLog("WebSocket connection error", "error")
                    }
                }
            }
        }

        YjsWebSocketManager.onSynced { synced ->
            runOnUiThread {
                addDebugLog("WebSocket synced: $synced", if (synced) "success" else "info")
                if (synced) {
                    updateDisplay()
                    loadSnapshot(roomId)
                }
            }
        }

        YjsWebSocketManager.onMessage { data ->
            // Handle incoming Yjs updates
            handleYjsUpdate(data)
        }

        // Connect to room
        YjsWebSocketManager.connect(roomId)

        // Send Yjs updates
        val yjsUpdate = getYjsUpdateBytes() // Your Yjs update
        YjsWebSocketManager.sendBinary(yjsUpdate)
    }

    override fun onDestroy() {
        super.onDestroy()
        YjsWebSocketManager.disconnect()
    }
}
*/