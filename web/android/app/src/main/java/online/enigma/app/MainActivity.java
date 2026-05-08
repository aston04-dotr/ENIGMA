package online.enigma.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.google.firebase.FirebaseApp;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    // Ensure default FirebaseApp is initialized before PushNotifications.register().
    FirebaseApp.initializeApp(this);
  }
}
