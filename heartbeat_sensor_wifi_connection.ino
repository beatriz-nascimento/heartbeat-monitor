#if defined(ESP32)
#include <WiFi.h>
#include <FirebaseESP32.h>
#elif defined(ESP8266)
#include <ESP8266WiFi.h>
#include <FirebaseESP8266.h>
#endif
#include "time.h"

//Provide the token generation process info.
#include <addons/TokenHelper.h>

//Provide the RTDB payload printing info and other helper functions.
#include <addons/RTDBHelper.h>

/* 1. Define the WiFi credentials */
#define WIFI_SSID "Wifi_network"
#define WIFI_PASSWORD "*******"

FirebaseData firebaseData;
String path = "/ESP32_Device";

//For the following credentials, see examples/Authentications/SignInAsUser/EmailPassword/EmailPassword.ino

/* 2. Define the API Key */
#define API_KEY "API_KEY"

/* 3. Define the RTDB URL */
#define DATABASE_URL "DATABASE_url" //<databaseName>.firebaseio.com or <databaseName>.<region>.firebasedatabase.app

/* 4. Define the user Email and password that alreadey registerd or added in your project */
#define USER_EMAIL "user@email.com"
#define USER_PASSWORD "*********"

//Define Firebase Data object
FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;


// Variable to save USER UID
String uid;

// Database main path (to be updated in setup with the user UID)
String databasePath;

// Database child nodes
String heartPath = "/heartbeat";
String timePath = "/timestamp";
String beatPath = "/bpm";
String rmssdPath = "/rmssd";

// Parent Node (to be updated in every loop)
String parentPath;

int timestamp;
String timestamp_mili;
int calcMilis = 0;
FirebaseJson json;
int sensorParam = 0;


const char* ntpServer = "pool.ntp.org";

// Timer variables (send new readings every 1 second)
unsigned long sendDataPrevMillis = 0;
unsigned long timerDelay = 20;

int sensorPin = 36;        //pin number to use the ADC
int sensorValue = 0;      //initialization of sensor variable, equivalent to EMA Y

float EMA_a_low = 0.1;    //initialization of EMA alpha
float EMA_a_high = 0.3;

float EMA_S_low = 0;        //initialization of EMA S
float EMA_S_high = 0;

float highpass = 0;
float bandpass = 0;
float lowpass = 0;
float firstValue = 0;
float secondValue = 0;


int count = 0;


int upperThreshold = 5;
int lowerThreshold = 0;
int ecgOffset = 0;
float beatsPerMinute = 0.0;
bool alreadyPeaked = false;
unsigned long firstPeakTime = 0;
unsigned long secondPeakTime = 0;
unsigned long rrInterval = 0;
int numRRDetected = 0;
bool hrvStarted = false;
bool hrvUpdate = false;
bool hrvComplete = false;
unsigned long hrvStartTime = 0;
unsigned long rrIntervalPrevious = 0;
float rrDiff = 0.0;
float rrDiffSquaredTotal = 0.0;
float diffCount = 0.0;
float rmssd = -1.0;

unsigned long getTime() {

  time_t now;
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) {
    Serial.println("Failed to obtain time");
    return (0);
  }
  time(&now);
  return now;
}

void setup() {
  Serial.begin(115200);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to Wi-Fi");
  while (WiFi.status() != WL_CONNECTED)
  {
    Serial.print(".");
    delay(300);
  }
  Serial.println();
  Serial.print("Connected with IP: ");
  Serial.println(WiFi.localIP());
  Serial.println();
  Serial.printf("Firebase Client v%s\n\n", FIREBASE_CLIENT_VERSION);

  configTime(0, 0, ntpServer);

  /* Assign the api key (required) */
  config.api_key = API_KEY;

  /* Assign the user sign in credentials */
  auth.user.email = USER_EMAIL;
  auth.user.password = USER_PASSWORD;

  /* Assign the RTDB URL (required) */
  config.database_url = DATABASE_URL;

  /* Assign the callback function for the long running token generation task */
  config.token_status_callback = tokenStatusCallback; //see addons/TokenHelper.h

  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);
  Firebase.setDoubleDigits(5);


  // Getting the user UID might take a few seconds
  Serial.println("Getting User UID");
  while ((auth.token.uid) == "") {
    Serial.print('.');
    delay(1000);
  }
  // Print user UID
  uid = auth.token.uid.c_str();
  Serial.print("User UID: ");
  Serial.println(uid);

  // Update database path
  databasePath = "/UsersData/" + uid + "/readings";



}

void loop()

{
//  if (Firebase.ready() && (millis() - sendDataPrevMillis > (secondValue - firstValue) || sendDataPrevMillis == 0)) {
if (Firebase.ready()) {
    sendDataPrevMillis = millis();
    sensorParam = analogRead(34); 
    sensorValue = analogRead(36);    //read the sensor value using ADC
    EMA_S_low = (EMA_a_low * sensorValue) + ((1 - EMA_a_low) * EMA_S_low); //run the EMA
    EMA_S_high = (EMA_a_high * sensorValue) + ((1 - EMA_a_high) * EMA_S_high);
    highpass = sensorValue - EMA_S_low;     //find the high-pass as before (for comparison)
    bandpass = EMA_S_high - EMA_S_low;      //find the band-pass

    for (size_t i = 0; i < 90; i++) {
      //            Serial.print (i);
      //      Serial.print (" , ");
      calcMilis = sendDataPrevMillis;
      timestamp = getTime();

      if ((calcMilis % 1000) < 10) {
        timestamp_mili = String(timestamp) + "00" + String(calcMilis % 1000);
      }
      else if ((calcMilis % 1000) < 100) {
        timestamp_mili = String(timestamp) + "0" + String(calcMilis % 1000);
      }
      else {
        timestamp_mili = String(timestamp) + String(calcMilis % 1000);
      }
      parentPath = databasePath + "/" + String(timestamp_mili);

      json.set(heartPath.c_str(), String(bandpass));
      json.set(timePath, String(timestamp_mili));
    }

    secondValue = millis();
    //    Serial.println (secondValue - firstValue);
    firstValue = secondValue;
//    Firebase.RTDB.setJSONAsync(&fbdo, parentPath.c_str(), &json);
    count++;


    int ecgReading = bandpass - ecgOffset;
    // Measure the ECG reading minus an offset to bring it into the same
    // range as the heart rate (i.e. around 60 to 100 bpm)

    if (ecgReading > upperThreshold && alreadyPeaked == false) {
      // Check if the ECG reading is above the upper threshold and that
      // we aren't already in an existing peak
      if (firstPeakTime == 0) {
        // If this is the very first peak, set the first peak time
        firstPeakTime = millis();
      }
      else {
        // Otherwise set the second peak time and calculate the
        // R-to-R interval. Once calculated we shift the second
        // peak to become our first peak and start the process
        // again
        secondPeakTime = millis();
        rrInterval = secondPeakTime - firstPeakTime;
        firstPeakTime = secondPeakTime;
        hrvUpdate = true;
        numRRDetected = numRRDetected + 1;
      }
      alreadyPeaked = true;
    }

    if (ecgReading < lowerThreshold) {
      // Check if the ECG reading has fallen below the lower threshold
      // and if we are ready to detect another peak
      alreadyPeaked = false;
    }

    // Calculate the beats per minute, rrInterval is measured in
    // milliseconds so we must multiply by 1000
    beatsPerMinute = (1.0 / rrInterval) * 60.0 * 1000;
    json.set(beatPath, String(beatsPerMinute));

    // Once two consecutive R-to-R intervals have been detected,
    // start the 5 minute HRV window
    if (!hrvStarted && numRRDetected >= 2) {
      hrvStarted = true;
      hrvStartTime = millis();
    }

    // If a new R-to-R interval has been detected, update the HRV measure
    if (hrvUpdate && hrvStarted) {
      // Add the square of successive differences between
      // R-to-R intervals to the running total
      rrDiff = float(rrInterval) - float(rrIntervalPrevious);
      rrDiffSquaredTotal = rrDiffSquaredTotal + sqrt(rrDiff);
      // Count the number of successive differences for averaging
      diffCount = diffCount + 1.0;
      // Reset the hrvUpdate flag
      hrvUpdate = false;
    }

    // Once five minute window has elapsed, calculate the RMSSD
    if (millis() - hrvStartTime >= 300000 && !hrvComplete) {
      rmssd = sqrt(rrDiffSquaredTotal / diffCount);
      json.set(rmssdPath, String(rmssd));
      hrvComplete = true;
 }
      Serial.println(sensorValue);
   
  }
}
