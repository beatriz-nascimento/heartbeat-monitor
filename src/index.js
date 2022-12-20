// convert epochtime to JavaScripte Date object
function epochToJsDate(epochTime) {
  epochTime = parseInt(epochTime)
  return new Date(epochTime);
}

// convert time to human-readable format YYYY/MM/DD HH:MM:SS
function epochToDateTime(epochTime) {
  var epochDate = new Date(epochToJsDate(epochTime));
  var dateTime = epochDate.getFullYear() + "/" +
    ("00" + (epochDate.getMonth() + 1)).slice(-2) + "/" +
    ("00" + epochDate.getDate()).slice(-2) + " " +
    ("00" + epochDate.getHours()).slice(-2) + ":" +
    ("00" + epochDate.getMinutes()).slice(-2) + ":" +
    ("00" + epochDate.getSeconds()).slice(-2) + ":" +
    ("000" + epochDate.getMilliseconds()).slice(-3);

  return dateTime;
}


// function to plot values on charts
function plotValues(chart, timestamp, value) {
  // console.log(chart, 'chart')
  var x = epochToJsDate(timestamp).getTime();
  var y = Number(value);
  //console.log(chart.series[0], 'xy')
  chart.series[0].addPoint([x, y], true, false, true);
}

// DOM elements
const loginElement = document.querySelector('#login-form');
const loginGoogleElement = document.querySelector('#login-google-form');
const contentElement = document.querySelector("#content-sign-in");
const userDetailsElement = document.querySelector('#user-details');
const authBarElement = document.querySelector('#authentication-bar');
const deleteButtonElement = document.getElementById('delete-button');
const deleteModalElement = document.getElementById('delete-modal');
const deleteDataFormElement = document.querySelector('#delete-data-form');
const viewDataButtonElement = document.getElementById('view-data-button');
const hideDataButtonElement = document.getElementById('hide-data-button');
const tableContainerElement = document.querySelector('#table-container');
const chartsRangeInputElement = document.getElementById('charts-range');
const loadDataButtonElement = document.getElementById('load-data');
const startReadingElement = document.getElementById('start-reading-button');
const stopReadingElement = document.getElementById('stop-reading-button');


var turnOn = false;
const heartbeatOn = document.getElementById('heart-beating')
const heartbeatOff = document.getElementById('heart-not-beating')



// DOM elements for sensor readings
const cardsReadingsElement = document.querySelector("#cards-div");
const chartsDivElement = document.querySelector('#charts-div');
const tempElement = document.getElementById("temp");
const updateElement = document.getElementById("lastUpdate")
const beatsElement = document.getElementById("beats");
const hrvElement = document.getElementById("hrv");


// MANAGE LOGIN/LOGOUT UI
const setupUI = (user) => {
  if (user) {
    //toggle UI elements
    loginElement.style.display = 'none';
    loginGoogleElement.style.display = 'none'
    contentElement.style.display = 'block';
    authBarElement.style.display = 'block';
    userDetailsElement.style.display = 'block';
    userDetailsElement.innerHTML = user.email;
    stopReadingElement.style.display = 'none'

    // get user UID to get data from database
    var uid = user.uid;
    console.log(uid);

    startedTime = new Date(); 

    // Database paths (with user UID)
    var dbPath = 'UsersData/' + uid.toString() + '/readings';
    var chartPath = 'UsersData/' + uid.toString() + '/charts/range';

    // Database references
    var dbRef = firebase.database().ref(dbPath);
    var chartRef = firebase.database().ref(chartPath);

    // CHARTS
    // Number of readings to plot on charts
    firebase.database().ref(dbPath).remove();
    function getChartsReading() {
      if (turnOn) {
        var chartRange = 0;
        console.log(chartRef, 'chartRef')
        console.log(dbRef, 'dbRef')

        // Get number of readings to plot saved on database (runs when the page first loads and whenever there's a change in the database)
        chartRef.on('value', snapshot => {
          chartRange = Number(snapshot.val());
          // Delete all data from charts to update with new values when a new range is selected
          chartT.destroy();

          // Render new charts to display new range of data
          chartT = createTemperatureChart();
          // Update the charts with the new range
          // Get the latest readings and plot them on charts (the number of plotted readings corresponds to the chartRange value)
          dbRef.orderByKey().limitToLast(chartRange).on('child_added', snapshot => {
            var jsonData = snapshot.toJSON(); // example: {temperature: 25.02, humidity: 50.20, pressure: 1008.48, timestamp:1641317355}
            // Save values on variables
            var heartbeat = jsonData.heartbeat;
            var timestamp = jsonData.Ts;
            // Plot the values on the charts
            plotValues(chartT, timestamp, heartbeat);
          });
        });
      }
    } ;

    chartRef.set(30);

    getCardReading();
    getChartsReading()

    function getCardReading() {
      if (turnOn) {
        dbRef.orderByKey().limitToLast(1).on('child_added', snapshot => {
          var jsonData = snapshot.toJSON(); // example: {temperature: 25.02, humidity: 50.20, pressure: 1008.48, timestamp:1641317355}
          var heartbeat = jsonData.heartbeat;
          var timestamp = jsonData.Ts;
          var bpm = jsonData.bpm;
          var hrv = jsonData.rmssd;

          // Update DOM elements
          tempElement.innerHTML = heartbeat;
          beatsElement.innerHTML = bpm;
          hrvElement.innerHTML = hrv; 
          updateElement.innerHTML = epochToDateTime(timestamp)? epochToDateTime(timestamp) :'0';
          console.log(bpm, 'bpm')
          console.log(hrv, 'hrv')

        })
      };
    }

    // DELETE DATA
    // Add event listener to open modal when click on "Delete Data" button
    deleteButtonElement.addEventListener('click', e => {
      console.log("Remove data");
      e.preventDefault;
      deleteModalElement.style.display = "block";
    });

    // Add event listener when delete form is submited
    deleteDataFormElement.addEventListener('submit', (e) => {
      // delete data (readings)
      dbRef.remove();
    });

    // TABLE
    var lastReadingTimestamp; //saves last timestamp displayed on the table
    // Function that creates the table with the first 100 readings
    function createTable() {

      if (turnOn) {
        // append all data to the table
        var firstRun = true;
        dbRef.orderByKey().limitToLast(100).on('child_added', function (snapshot) {
          if (snapshot.exists() && firstRun) {
            var jsonData = snapshot.toJSON();
            var heartbeat = jsonData.heartbeat;
            var timestamp = jsonData.Ts;
            var content = '';
            content += '<tr>';
            content += '<td>' + epochToDateTime(timestamp) + '</td>';
            content += '<td>' + heartbeat + '</td>';
            content += '</tr>';
            $('#tbody').prepend(content);
            // Save lastReadingTimestamp --> corresponds to the first timestamp on the returned snapshot data
            if (firstRun) {
              lastReadingTimestamp = timestamp;
              firstRun = false;
              console.log(lastReadingTimestamp, 'timestampo');
            }
          }
        });
      }
    };

    // append readings to table (after pressing More results... button)
    function appendToTable() {
      var dataList = []; // saves list of readings returned by the snapshot (oldest-->newest)
      var reversedList = []; // the same as previous, but reversed (newest--> oldest)
      console.log("APEND");
      dbRef.orderByKey().limitToLast(100).endAt(lastReadingTimestamp).once('value', function (snapshot) {
        // convert the snapshot to JSON
        if (snapshot.exists()) {
          snapshot.forEach(element => {
            var jsonData = element.toJSON();
            dataList.push(jsonData); // create a list with all data
          });
          lastReadingTimestamp = dataList[0].timestamp; //oldest timestamp corresponds to the first on the list (oldest --> newest)
          reversedList = dataList.reverse(); // reverse the order of the list (newest data --> oldest data)

          var firstTime = true;
          // loop through all elements of the list and append to table (newest elements first)
          reversedList.forEach(element => {
            if (firstTime) { // ignore first reading (it's already on the table from the previous query)
              firstTime = false;
            }
            else {
              var heartbeat = element.heartbeat;
              var timestamp = element.timestamp;
              var content = '';
              content += '<tr>';
              content += '<td>' + epochToDateTime(timestamp) + '</td>';
              console.log(timestamp, 'realtimestamp2')

              content += '<td>' + heartbeat + '</td>';
              content += '</tr>';
              $('#tbody').append(content);
            }
          });
        }
      });
    }

    viewDataButtonElement.addEventListener('click', (e) => {
      // Toggle DOM elements
      tableContainerElement.style.display = 'block';
      viewDataButtonElement.style.display = 'none';
      hideDataButtonElement.style.display = 'inline-block';
      loadDataButtonElement.style.display = 'inline-block';
      tableContainerElement.style.display = 'block';

      createTable();
    });

    startReadingElement.addEventListener('click', (e) => {
      turnOn = true;
      startedTime = new Date().getTime();
      getCardReading();
      getChartsReading()
      createTable()
      startReadingElement.style.display = 'none';
      stopReadingElement.style.display = 'inline-block';
      heartbeatOn.style.display = 'inline-block';
      heartbeatOff.style.display = 'none';


    });


    stopReadingElement.addEventListener('click', (e) => {
      dbRef.off();
      chartRef.off()
      turnOn = false;
      getCardReading();
      getChartsReading()

      stopReadingElement.style.display = 'none';
      startReadingElement.style.display = 'inline-block';
      heartbeatOn.style.display = 'none';
      heartbeatOff.style.display = 'inline-block';
      readingsValuesElement.style.display = 'none'; 


    });

    loadDataButtonElement.addEventListener('click', (e) => {
      appendToTable();
    });

    hideDataButtonElement.addEventListener('click', (e) => {
      tableContainerElement.style.display = 'none';
      viewDataButtonElement.style.display = 'block';
    });

    // IF USER IS LOGGED OUT
  } else {
    // toggle UI elements
    loginElement.style.display = 'block';
    loginGoogleElement.style.display = 'block';
    authBarElement.style.display = 'none';
    userDetailsElement.style.display = 'none';
    contentElement.style.display = 'none';
  }
}