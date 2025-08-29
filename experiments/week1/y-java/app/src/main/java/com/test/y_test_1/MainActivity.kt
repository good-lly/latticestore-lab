package com.test.y_test_1

import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import com.test.y_test_1.ui.theme.Ytest1Theme
import io.agora.board.yjs.YJS

val roomId = "5f6f97"

class MainActivity : ComponentActivity() {
 private lateinit var yjs: YJS


    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        yjs = YJS.Builder(this).build()
        enableEdgeToEdge()
        setContent {
            Ytest1Theme {
                Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
                    Greeting(
                        name = "Android",
                        modifier = Modifier.padding(innerPadding)
                    )
                }
            }
        }

        YjsWebSocketManager.apply {
            onStatus { status ->
                Log.i("socket:::status", status.toString())
            }

            onSynced { synced ->
                Log.i("socket:::synced", synced.toString())
                if (synced) {
                    // Document is synced
                }
            }

            onMessage { bytes ->
                Log.i("socket:::bytes", bytes.toString())
            }

            // Connect to room
            connect(roomId)
        }
    }
}

@Composable
fun Greeting(name: String, modifier: Modifier = Modifier) {
    Text(
        text = "Hello $name!",
        modifier = modifier
    )
}

@Preview(showBackground = true)
@Composable
fun GreetingPreview() {
    Ytest1Theme {
        Greeting("Android")
    }
}