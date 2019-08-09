var colorHash = new ColorHash ();
class Accumulator
{
	constructor (window)
	{
		this.base   = 1000000
		this.window = window || this.base;
		this.factor = this.base/this.window;
		this.points = [];
		this.accumulated = 0;
	}

	accumulate (time, val)
	{
		//Delete old values
		while (this.points.length && this.points[0].time < (time - this.window))
			//Remove from array and from accumulated
			this.accumulated -= this.points.shift ().val;
		//Accumulate
		this.accumulated += val;
		//Push new point
		this.points.push ({time, val});
		//return average in window
		return this.accumulated*this.factor;
	}

}
;

const Metadata = {
	transportSeqNum: 0,
	feedbackNum: 1,
	size: 2,
	sent: 3,
	recv: 4,
	deltaSent: 5,
	deltaRecv: 6,
	delta: 7,
	bwe: 8,
	rtt: 9,
	lost: "lost",
	delay: "delay",
	bitrate: "bitrate",
	ts: "ts"
};

// Convert CSV file to array of data points, adding the neccesary info
function Process (csv)
{
	const bitrate = new Accumulator (1000000);
	const data = [];
	let lost = 0;
	let minRTT = 0;
	let minAcumulatedDelta = 0;
	let acumulatedDelta = 0;
	//Convert each line to array
	for (let ini = 0, end = csv.indexOf ("\n", ini); end != -1; ini = end + 1, end = csv.indexOf ("\n", ini))
	{
		//get line
		const line = csv.substr (ini, end - ini).trim ();
		//Get data point
		const point = line.split ("|").map (Number);
		//Check if it was lost
		if (point[Metadata.sent] && !point[Metadata.recv])
		{
			//Increse lost
			lost++;
			//Add lost count
			point[Metadata.lost] = lost;
		}
		//Add sent bitrate
		point[Metadata.bitrate] = bitrate.accumulate (point[Metadata.sent], point[Metadata.size] * 8);
		//Get accumulated delta
		acumulatedDelta += point[Metadata.delta];
		//Check min/maxs
		if (!minRTT || point[Metadata.rtt] < minRTT)
			minRTT = point[Metadata.rtt];
		if (!minAcumulatedDelta || acumulatedDelta < minAcumulatedDelta)
			minAcumulatedDelta = acumulatedDelta;
		//Set network buffer delay
		point[Metadata.delay] = acumulatedDelta;
		//Set sent time as Date
		point[Metadata.ts] = new Date (point[Metadata.sent] / 1000);
		//append to data
		data.push (point);
	}

	//Set base delay to 0
	for (const point of data)
		point[Metadata.delay] = (point[Metadata.delay] - minAcumulatedDelta) / 1000;
	return data;
}

function DisplayData (csv)
{
	window.charts = {};

	//Get data
	const data = Process (csv);

	//Create container for all charts
	const container = am4core.create ("chartdiv", am4core.Container);
	container.reverseOrder  = true;
	container.width = container.height = am4core.percent (100);
	container.layout = "vertical";


	//Create commong scrollbar
	const scrollbar = new am4core.Scrollbar ()

	// Create charts map

	//Create all charts
	for (const id of ["ms", "mbps"])
	{
		//Chreate new chart
		const chart = container.createChild (am4charts.XYChart);
		//Set padding
		chart.padding (10, 15, 10, 15);
		//Create legend
		chart.legend = new am4charts.Legend ();
		chart.legend.parent = chart.plotContainer;
		chart.legend.zIndex = 100;
		//Set chart data
		chart.data = data;
		//Create cursor
		chart.cursor = new am4charts.XYCursor ();
		//Create x axis
		const sentAxis = chart.xAxes.push (new am4charts.DateAxis ());
		sentAxis.renderer.grid.template.location = 0;
		sentAxis.renderer.labels.template.fill = am4core.color (colorHash.hex ("sentAxis"));
		sentAxis.renderer.grid.template.strokeOpacity = 0.07;
		sentAxis.dateFormats.setKey("millisecond", "mm:ss.nnn");
		sentAxis.periodChangeDateFormats.setKey("millisecond", "mm:ss.nnn");
		sentAxis.tooltipText = "{dateX}";
		sentAxis.baseDuration = 10; 
		
		//When doing selection
		sentAxis.events.on("selectionextremeschanged", function (event) {
			console.log("selectionextremeschanged");
			//If we are disabled
			if (!chart.cursor.interactionsEnabled)
				//done
				return;
			//Get cursor
			const axis = chart.xAxes.getIndex(0);
			//Show other cursors
			for (const other of Object.values(charts))
			{
				if (other != chart)
				{
					const dateAxis = other.xAxes.getIndex(0);
					dateAxis.events.disableType("selectionextremeschanged");
					dateAxis.start = axis.start;
					dateAxis.end = axis.end;
					dateAxis.events.enableType("selectionextremeschanged");
				}
			}
		});
		//Set scrollbar
		chart.scrollbarX = scrollbar;
		//Store chart
		charts[id] = chart;
		
		chart.cursor.events.on ("shown", (event) =>{
			//If we are disabled
			if (!chart.cursor.interactionsEnabled)
				//done
				return;
			//Get cursor
			var point = {x: chart.cursor.point.x, y: 0};
			//Show other cursors
			for (const other of Object.values(charts))
			{
				if (other != chart)
				{
					console.log("show");
					other.cursor.interactionsEnabled = false;
					other.cursor.triggerMove (point);
					other.cursor.show();
				}
			}
		});
		
		chart.cursor.events.on ("cursorpositionchanged", (event) =>{
			console.log("cursorpositionchanged")
			//If we are disabled
			if (!chart.cursor.interactionsEnabled)
				//done
				return;
			//Get cursor
			var point = {x: chart.cursor.point.x, y: 0};
			//Show other cursors
			for (const other of Object.values(charts))
				if (other != chart)
					other.cursor.triggerMove (point);
		});
		//Hide event
		chart.cursor.events.on ("hidden", (event) =>{
			console.log("hidden");
			//If we are disabled
			if (!chart.cursor.interactionsEnabled)
			{
				//Enable them again
				chart.cursor.interactionsEnabled = true;
				//done
				return;
			}
			//Hide other cursors
			for (const other of Object.values(charts))
				if (other != chart)
					other.cursor.hide();
		});
	}

	//Create BWE and bitate series and mbps axis
	{
		//Get chart
		const chart = charts.mbps;
		//Create axis
		var mbpsAxis = chart.yAxes.push (new am4charts.ValueAxis ());
		mbpsAxis.renderer.labels.template.fill = am4core.color (colorHash.hex ("mbpsAxis"));
		mbpsAxis.numberFormatter = new am4core.NumberFormatter ();
		mbpsAxis.numberFormatter.numberFormat = "#.###a'bps'";
		mbpsAxis.renderer.maxWidth = mbpsAxis.renderer.minWidth = 120;
		mbpsAxis.renderer.grid.template.strokeOpacity = 0.07;
		mbpsAxis.tooltip.disabled = true;


		var bweSeries = chart.series.push (new am4charts.LineSeries ());
		bweSeries.name = "BWE";
		bweSeries.dataFields.dateX = Metadata.ts;
		bweSeries.dataFields.valueY = Metadata.bwe;
		bweSeries.yAxis = mbpsAxis;
		//bweSeries.xAxis = sentAxis;
		bweSeries.tooltipText = "{name}: {valueY.formatNumber(\"#.###a'bps'\")}";
		bweSeries.fill = am4core.color (colorHash.hex ("bweSeries"));
		bweSeries.stroke = am4core.color (colorHash.hex ("bweSeries"));
		bweSeries.startLocation = 0;
		bweSeries.connect = false;
		bweSeries.autoGapCount = 100;
		//series.strokeWidth = 3;

		var bitrateSeries = chart.series.push (new am4charts.LineSeries ());
		bitrateSeries.name = "Bitrate";
		bitrateSeries.dataFields.dateX = Metadata.ts;
		bitrateSeries.dataFields.valueY = Metadata.bitrate;
		bitrateSeries.yAxis = mbpsAxis;
		//bitrateSeries.xAxis = sentAxis;
		bitrateSeries.tooltipText = "{name}: {valueY.formatNumber(\"#.###a'bps'\")}";
		bitrateSeries.fill = am4core.color (colorHash.hex ("bitrateSeries"));
		bitrateSeries.stroke = am4core.color (colorHash.hex ("bitrateSeries"));
		bitrateSeries.startLocation = 0;
		bitrateSeries.connect = false;
		bitrateSeries.autoGapCount = 100;

	}


	//Create lost series and axis
//	{
//		var lostAxis = chart.yAxes.push (new am4charts.ValueAxis ());
//		lostAxis.renderer.labels.template.fill = am4core.color(colorHash.hex("lostSeries"));
//		lostAxis.renderer.minWidth = 60;
//		lostAxis.renderer.opposite = true;
//		lostAxis.renderer.grid.template.strokeOpacity = 0.07;
//
//		var lostSeries = chart.series.push (new am4charts.LineSeries ());
//		lostSeries.name = "lost";
//		lostSeries.dataFields.dateX = Metadata.ts;
//		lostSeries.dataFields.valueY = Metadata.lost;
//		lostSeries.yAxis = lostAxis;
////		lostSeries.tooltipText = "{valueY}";
//		lostSeries.fill = am4core.color(colorHash.hex("lostSeries"));
//		lostSeries.stroke = am4core.color(colorHash.hex("lostSeries"));
//		//series.strokeWidth = 3;
//
//		//Add to scrollbar
//		//chart.scrollbarX.series.push (lostSeries);
//	}

	//Create milisecond axis and rtt,delay and delta series
	{
		//Get milliseconds chart
		const chart = charts.ms;
		//Create axis
		var msAxis = chart.yAxes.push (new am4charts.ValueAxis ());
		msAxis.numberFormatter = new am4core.NumberFormatter ();
		msAxis.numberFormatter.numberFormat = "#'ms'";
		msAxis.renderer.labels.template.fill = am4core.color (colorHash.hex ("msAxis"));
		msAxis.renderer.maxWidth = msAxis.renderer.minWidth = 120;
//		msAxis.renderer.opposite = true;
		msAxis.renderer.grid.template.strokeOpacity = 0.07;
		msAxis.tooltip.disabled = true;

		var rttSeries = chart.series.push (new am4charts.LineSeries ());
		rttSeries.name = "RTT";
		rttSeries.dataFields.dateX = Metadata.ts;
		rttSeries.dataFields.valueY = Metadata.rtt;
		rttSeries.yAxis = msAxis;
		rttSeries.tooltipText = "{name}: {valueY}ms";
		rttSeries.fill = am4core.color (colorHash.hex ("rttSeries"));
		rttSeries.stroke = am4core.color (colorHash.hex ("rttSeries"));
		rttSeries.startLocation = 0;
		rttSeries.connect = false;
		rttSeries.autoGapCount = 100;
		
		var delaySeries = chart.series.push (new am4charts.LineSeries ());
		delaySeries.name = "delay";
		delaySeries.dataFields.dateX = Metadata.ts;
		delaySeries.dataFields.valueY = Metadata.delay;
		delaySeries.yAxis = msAxis;
		delaySeries.tooltipText = "{name}: {valueY}ms";
		delaySeries.fill = am4core.color (colorHash.hex ("delaySeries"));
		delaySeries.stroke = am4core.color (colorHash.hex ("delaySeries"));
		delaySeries.startLocation = 0;
		delaySeries.connect = false;
		delaySeries.autoGapCount = 100;
		
	}


}

