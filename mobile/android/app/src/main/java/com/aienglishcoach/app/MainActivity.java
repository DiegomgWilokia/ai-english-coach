package com.aienglishcoach.app;

import android.os.Bundle;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Android 15+ forces edge-to-edge. Pad the content (SystemBars insetsHandling is "disable" in
        // capacitor.config.json) so the WebView never sits under the status bar, navigation bar or keyboard.
        ViewCompat.setOnApplyWindowInsetsListener(getWindow().getDecorView(), (v, insets) -> {
            int types = WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout();
            Insets bars = insets.getInsets(types);
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            v.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
            // Report zero bar insets to the page (env(safe-area-inset-*) = 0) instead of CONSUMED,
            // which breaks WebView inset recalculation: https://issues.chromium.org/issues/461332423
            return new WindowInsetsCompat.Builder(insets).setInsets(types, Insets.NONE).build();
        });
    }
}
