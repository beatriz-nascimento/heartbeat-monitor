// Create the charts when the web page loads
window.addEventListener('load', onload);

function onload(event){
  chartT = createTemperatureChart();
}

// Create Temperature Chart
  function createTemperatureChart() {
    var chart = new Highcharts.chart({
      chart:{ 
        renderTo:'chart-temperature',
        type: 'spline' ,
        
      },
      series: [
        {
          name: 'Pulse Sensor'
        }
      ],
      title: { 
        text: undefined
      },
      plotOptions: {
        line: { 
          animation: false,
          dataLabels: { 
            enabled: false 
          }
        }
      },

 
      xAxis: {
        type: 'datetime',
        dateTimeLabelFormats: { millisecond:{
          main:"%H:%M:%S.%L" },
        }
      },
      yAxis: {
        title: { 
          text: 'Heartbeat' 
        }
      },
      credits: { 
        enabled: false 
      }
    });
    console.log(chart, 'chart values');
  
    return chart;
  }

