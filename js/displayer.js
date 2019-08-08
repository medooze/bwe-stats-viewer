var colorHash = new ColorHash();

class Accumulator
{
	constructor()
	{
		this.window = 1000000;
		this.points = [];
		this.accumulated = 0;
	}
	
	accumulate(time,val)
	{
		//Delete old values
		while (this.points.length && this.points[0].time<(time-this.window))
			//Remove from array and from accumulated
			this.accumulated -= this.points.shift().val;
		//Accumulate
		this.accumulated += val;
		//Push new point
		this.points.push({time,val});
		//return average in window
		return this.accumulated;
	}
	
};

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
	bitrate: "bitrate"
};

// Convert CSV file to array of data points, adding the neccesary info
function Process(csv)
{
	const bitrate = new Accumulator(1000000);
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
		const point = line.split ("|").map(Number);
		//Check if it was lost
		if (point[Metadata.sent] &&!point[Metadata.recv])
		{
			//Increse lost
			lost++;
			//Add lost count
			point[Metadata.lost] = lost;
		}
		//Add sent bitrate
		point[Metadata.bitrate] = bitrate.accumulate(point[Metadata.sent],point[Metadata.size]*8);
		//Get accumulated delta
		acumulatedDelta += point[Metadata.delta];
		//Check min/maxs
		if (!minRTT || point[Metadata.rtt]<minRTT)
			minRTT = point[Metadata.rtt];
		if (!minAcumulatedDelta || acumulatedDelta<minAcumulatedDelta)
			minAcumulatedDelta = acumulatedDelta;
		//Set network buffer delay
		point[Metadata.delay] = acumulatedDelta;
		//Set sent and recv times in seconds
		point[Metadata.sent] = point[Metadata.sent] / 1000000;
		point[Metadata.recv] = point[Metadata.recv] / 1000000;
		//append to data
		data.push (point);
	}

	//Set base delay to 0
	for (const point of data)
		point[Metadata.delay] = (point[Metadata.delay] - minAcumulatedDelta)/1000;
	
	return data;
}

function DisplayData (csv)
{
	// Create chart
	var chart = am4core.create ("chartdiv", am4charts.XYChart);

	//Create scrollbar
	chart.scrollbarX = new am4charts.XYChartScrollbar ();

	//Create legend
	chart.legend = new am4charts.Legend ();
	chart.legend.parent = chart.plotContainer;
	chart.legend.zIndex = 100;

	//Set chart data
	chart.data = Process(csv);

	//Create x axis
	var sentAxis = chart.xAxes.push (new am4charts.ValueAxis ());
	sentAxis.renderer.grid.template.location = 0;
	sentAxis.renderer.labels.template.fill = am4core.color(colorHash.hex("sentAxis"));
	sentAxis.renderer.grid.template.strokeOpacity = 0.07;
	sentAxis.numberFormatter = new am4core.NumberFormatter();
	sentAxis.numberFormatter.numberFormat ="#'s'";

	//Create cursor
	chart.cursor = new am4charts.XYCursor ();
	chart.cursor.xAxis = sentAxis;

	//Create BWE and bitate series and mbps axis
	{
		var mbpsAxis = chart.yAxes.push (new am4charts.ValueAxis ());
		mbpsAxis.tooltip.disabled = false;
		mbpsAxis.renderer.labels.template.fill = am4core.color(colorHash.hex("mbpsAxis"));
		mbpsAxis.numberFormatter = new am4core.NumberFormatter();
		mbpsAxis.numberFormatter.numberFormat ="#.###a'bps'";
		mbpsAxis.renderer.minWidth = 60;
		mbpsAxis.renderer.grid.template.strokeOpacity = 0.07;

		var bweSeries = chart.series.push (new am4charts.LineSeries ());
		bweSeries.name = "BWE";
		bweSeries.dataFields.valueX = Metadata.sent;
		bweSeries.dataFields.valueY = Metadata.bwe;
		bweSeries.yAxis = mbpsAxis;
		bweSeries.xAxis = sentAxis;
		bweSeries.tooltipText = "{valueY.formatNumber(\"#.###a'bps'\")";
		bweSeries.fill = am4core.color(colorHash.hex("bweSeries"));;
		bweSeries.stroke = am4core.color(colorHash.hex("bweSeries"));
		//series.strokeWidth = 3;
		
		var bitrateSeries = chart.series.push (new am4charts.LineSeries ());
		bitrateSeries.name = "Bitrate";
		bitrateSeries.dataFields.valueX = Metadata.sent;
		bitrateSeries.dataFields.valueY = Metadata.bitrate;
		bitrateSeries.yAxis = mbpsAxis;
		bitrateSeries.xAxis = sentAxis;
		bitrateSeries.tooltipText = "{valueY.formatNumber(\"#.###a'bps'\")}";
		bitrateSeries.fill = am4core.color(colorHash.hex("bitrateSeries"));;
		bitrateSeries.stroke = am4core.color(colorHash.hex("bitrateSeries"));;

		//Add to scrollbar
		chart.scrollbarX.series.push (bweSeries);
	}


	//Create lost series and axis
//	{
//		var lostAxis = chart.yAxes.push (new am4charts.ValueAxis ());
//		lostAxis.tooltip.disabled = false;
//		lostAxis.renderer.labels.template.fill = am4core.color(colorHash.hex("lostSeries"));
//		lostAxis.renderer.minWidth = 60;
//		lostAxis.renderer.opposite = true;
//		lostAxis.renderer.grid.template.strokeOpacity = 0.07;
//
//		var lostSeries = chart.series.push (new am4charts.LineSeries ());
//		lostSeries.name = "lost";
//		lostSeries.dataFields.valueX = Metadata.sent;
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
		var msAxis = chart.yAxes.push (new am4charts.ValueAxis ());
		//msAxis.tooltip.disabled = false;
		msAxis.numberFormatter = new am4core.NumberFormatter();
		msAxis.numberFormatter.numberFormat ="#'ms'";
		msAxis.renderer.labels.template.fill = am4core.color(colorHash.hex("msAxis"));
		msAxis.renderer.minWidth = 60;
		msAxis.renderer.opposite = true;
		msAxis.renderer.grid.template.strokeOpacity = 0.07;
		
		var rttSeries = chart.series.push (new am4charts.LineSeries ());
		rttSeries.name = "RTT";
		rttSeries.dataFields.valueX = Metadata.sent;
		rttSeries.dataFields.valueY = Metadata.rtt;
		rttSeries.yAxis = msAxis;
		rttSeries.tooltipText = "{valueY}";
		rttSeries.fill = am4core.color(colorHash.hex("rttSeries"));
		rttSeries.stroke = am4core.color(colorHash.hex("rttSeries"));
	
		var delaySeries = chart.series.push (new am4charts.LineSeries ());
		delaySeries.name = "delay";
		delaySeries.dataFields.valueX = Metadata.sent;
		delaySeries.dataFields.valueY = Metadata.delay;
		delaySeries.yAxis = msAxis;
		delaySeries.tooltipText = "{valueY}";
		delaySeries.fill = am4core.color(colorHash.hex("delaySeries"));
		delaySeries.stroke = am4core.color(colorHash.hex("delaySeries"));
		//series.strokeWidth = 3;

		//Add to scrollbar
		//chart.scrollbarX.series.push (delaySeries);
	}


}

