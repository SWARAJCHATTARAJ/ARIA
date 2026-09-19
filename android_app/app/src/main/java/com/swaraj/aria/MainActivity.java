package com.swaraj.aria;

import android.os.Bundle;
import android.util.Log;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Scanner;

public class MainActivity extends AppCompatActivity {
    private EditText queryInput;
    private TextView resultText;

    // Replace with your FastAPI backend IP (e.g. 192.168.x.x)
    private static final String BACKEND_URL = "http://10.0.2.2:8000/api/v1/chat";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        queryInput = findViewById(R.id.queryInput);
        Button askButton = findViewById(R.id.askButton);
        resultText = findViewById(R.id.resultText);

        askButton.setOnClickListener(v -> {
            String query = queryInput.getText().toString();
            if (!query.isEmpty()) {
                resultText.setText("Thinking...");
                askAria(query);
            }
        });
    }

    private void askAria(String query) {
        new Thread(() -> {
            try {
                URL url = new URL(BACKEND_URL);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setDoOutput(true);

                // Simple JSON payload
                String jsonInputString = "{\"query\": \"" + query + "\"}";

                try (OutputStream os = conn.getOutputStream()) {
                    byte[] input = jsonInputString.getBytes(StandardCharsets.UTF_8);
                    os.write(input, 0, input.length);
                }

                Scanner scanner = new Scanner(conn.getInputStream(), StandardCharsets.UTF_8.name());
                String response = scanner.useDelimiter("\\A").next();
                scanner.close();

                runOnUiThread(() -> resultText.setText(response));
            } catch (Exception e) {
                Log.e("ARIA", "Error connecting to backend", e);
                runOnUiThread(() -> resultText.setText("Error: " + e.getMessage()));
            }
        }).start();
    }
}
