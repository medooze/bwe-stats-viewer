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
	
	getAccumulated()
	{
		return this.accumulated;
	}
};
const colors = ["#E69F00", "#56B4E9", "#009E73", "#F0E442", "#0072B2", "#D55E00", "#CC79A7", "#000000"]

const Metadata = {
	fb			: 0,
	transportSeqNum		: 1,
	feedbackNum		: 2,
	size			: 3,
	sent			: 4,
	recv			: 5,
	deltaSent		: 6,
	deltaRecv		: 7,
	delta			: 8,
	deltaAcumulated		: 9,
	deltaInstant		: 10,
	bwe			: 11,
	targetBitrate		: 12,
	availableBitrate	: 13,
	rtt			: 14,
	minrtt			: 15,
	estimatedrtt		: 16,
	mark			: 17,
	rtx			: 18,
	probing			: 19,
	state			: 20,
	lost			: "lost",
	delay			: "delay",
	target			: "target",
	available		: "available",
	bitrateSent		: "bitrateSent",
	bitrateRecv		: "bitrateReceived",
	bitrateMedia		: "bitrateMedia",
	bitrateRTX		: "bitrateRTX",
	bitrateProbing		: "bitrateProbing",
	ts			: "ts",
	fbDelay			: "fbDelay",
	
};
const data = [];

const MonitorDuration = 200000;
// Convert CSV file to array of data points, adding the neccesary info
function Process (csv)
{
	const packetsSent	= new Accumulator (MonitorDuration);
	const packetsLost	= new Accumulator (MonitorDuration);
	const bitrateSent	= new Accumulator (MonitorDuration);
	const bitrateRecv	= new Accumulator (MonitorDuration);
	const bitrateMedia	= new Accumulator (MonitorDuration);
	const bitrateRTX	= new Accumulator (MonitorDuration);
	const bitrateProbing	= new Accumulator (MonitorDuration);
	
	let lost = 0;
	let minRTT = 0;
	let minAcumulatedDelta = 0;
	let acumulatedDelta = 0;
	let lastFeedbackNum = 0
	let first = true;
	let firstInInterval;
	let count = 0;
	//Convert each line to array
	for (let ini = 0, end = csv.indexOf ("\n", ini); end != -1; ini = end + 1, end = csv.indexOf ("\n", ini))
	{
		//get line
		const line = csv.substr (ini, end - ini).trim ();
		//Get data point
		const point = line.split ("|").map (Number);
		//One more packet
		packetsSent.accumulate(point[Metadata.sent],1);
		//Check if it was lost
		if (point[Metadata.sent] && !point[Metadata.recv])
		{
			//Increse lost
			packetsLost.accumulate(point[Metadata.sent],1);
			//Update received, don't increase
			point[Metadata.bitrateRecv] = bitrateRecv.accumulate (point[Metadata.recv], 0);
		} else {
			//Update lost, don't increase
			packetsLost.accumulate(point[Metadata.sent],0);
			//Add recevided bitrate
			point[Metadata.bitrateRecv] = bitrateRecv.accumulate (point[Metadata.recv], point[Metadata.size] * 8);
		}
		//Add lost count
		point[Metadata.lost] = 100 * packetsLost.getAccumulated () / packetsSent.getAccumulated ();
		//Add sent bitrate
		point[Metadata.bitrateSent]	= bitrateSent.accumulate (point[Metadata.sent], point[Metadata.size] * 8);
		point[Metadata.bitrateMedia]	= bitrateMedia.accumulate (point[Metadata.sent], !point[Metadata.rtx] && !point[Metadata.probing] ? point[Metadata.size] * 8 : 0);
		point[Metadata.bitrateRTX]	= bitrateRTX.accumulate (point[Metadata.sent], point[Metadata.rtx] ? point[Metadata.size] * 8 : 0);
		point[Metadata.bitrateProbing]	= bitrateProbing.accumulate (point[Metadata.sent], point[Metadata.probing] ? point[Metadata.size] * 8 : 0);
		//If there has been a discontinuity on feedback pacekts
		if (first || (point[Metadata.feedbackNum]!=lastFeedbackNum && ((lastFeedbackNum+1)%256)!=point[Metadata.feedbackNum]))
		{
			//Fix delta up to now
			for(let i=firstInInterval; i<count; ++i)
				//Set base delay to 0
				data[i][Metadata.delay] = Math.trunc((data[i][Metadata.delay] - minAcumulatedDelta) / 1000);
			//Reset accumulated delta
			acumulatedDelta = 0;
			minAcumulatedDelta = 0;
			//This is the first of the interval
			firstInInterval = count;
		} else {
			//Get accumulated delta
			acumulatedDelta += point[Metadata.delta];
		}
		//Check min/maxs
		if (!minRTT || point[Metadata.rtt] < minRTT)
			minRTT = point[Metadata.rtt];
		if (acumulatedDelta < minAcumulatedDelta)
			minAcumulatedDelta = acumulatedDelta;
		//Set network buffer delay
		point[Metadata.delay] = acumulatedDelta;
		//Set sent time as Date
		point[Metadata.ts] = new Date(point[Metadata.sent] / 1000);
		//Set the delay of the feedback
		point[Metadata.fbDelay] = (point[Metadata.fb] - point[Metadata.sent])/1000;
		//append to data
		data.push (point);
		//Store last feedback packet number
		lastFeedbackNum = point[Metadata.feedbackNum];
		first = false;
		//Inc count
		count ++;
	}
	//Fix delta up to now
	for(let i=firstInInterval; i<count; ++i)
		//Set base delay to 0
		data[i][Metadata.delay] = (data[i][Metadata.delay] - minAcumulatedDelta) / 1000;
	let i = 0;
	for (const point of data)
	{
		//Find what is the estimation when this packet was sent
		while (i<data.length && data[i][Metadata.sent]<point[Metadata.fb])
			//Skip until the estimation is newer than the packet time
			i++;
		//Set target to previous target bitate
		point[Metadata.target] = i ? data[i-1][Metadata.targetBitrate] : 0;
		point[Metadata.available] = i ? data[i-1][Metadata.availableBitrate] : 0;
	}
	return data;
}

function DisplayData (name,csv)
{
	//Set window title
	window.document.title = name;
	
	//The charts
	const charts = window.charts = {};

	//Get data
	const data = window.data = Process (csv);
	const preview = window.preview = [];
	
	for (const point of data)
		if (!preview.length || point[Metadata.sent]-preview[preview.length-1][Metadata.sent]>1000000)
			preview.push(point);
	
	//Get number of chunks
	const linesPerChunk = 10000;
	const chunks = data.length / linesPerChunk;

	if (chunks > 1)
	{
		//Create preview span
		{
			//Create span
			const span = document.createElement("span");
			//Set text
			span.innerText = "Preview";
			span.className = "chunk";
			//On click
			span.onclick = () =>
			{
				for (const chart of Object.values(charts))
					chart.data = preview;
			};

			//Add to body
			document.body.appendChild(span);
		}

		for (let i = 0; i < chunks; ++i)
		{
			//Create span
			const span = document.createElement("span");
			//Set text
			span.innerText = "Chunk #" + i;
			span.className = "chunk";
			//On click
			span.onclick = () =>
			{
				const slice = data.slice(linesPerChunk * i, linesPerChunk * (i + 1));;
				for (const chart of Object.values(charts))
					chart.data = slice;
			};

			//Add to body
			document.body.appendChild(span);
		}
	}

	//am4core.options.minPolylineStep = 1.5;
	am4core.options.queue = false;
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
		chart.margin (10, 15, 10, 15);
		//Use utc time
		chart.dateFormatter.utc = true;
		//Create legend
		chart.legend = new am4charts.Legend ();
		chart.legend.parent = chart.plotContainer;
		chart.legend.zIndex = 100;
		//Set chart data
		chart.data = chunks > 1 ? preview : data;
		//Create cursor
		chart.cursor = new am4charts.XYCursor ();
		//Create x axis
		const sentAxis = chart.xAxes.push (new am4charts.DateAxis ());
		sentAxis.renderer.grid.template.location = 0;
		sentAxis.renderer.labels.template.fill = am4core.color (colorHash.hex ("sentAxis"));
		sentAxis.renderer.grid.template.strokeOpacity = 0.01;
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
		
		//Create ranges for each chunk
		for (let i=0;chunks>1 & i<chunks;++i)
		{
			// axis ranges
			var range = sentAxis.axisRanges.create();
			range.date = data[i*linesPerChunk][Metadata.ts];
			range.endDate = data[Math.min((i+1)*linesPerChunk,data.length)-1][Metadata.ts];
			range.axisFill.fill = chart.colors.getIndex(i);
			range.axisFill.fillOpacity = 0.1;
			
			range.label.text = "#" + i;
			range.label.inside = true;
			range.label.layout = "abosolute";
			range.label.horizontalCenter = "right"
			range.label.verticalCenter = "bottom";
			range.label.rotation = 90;
			range.label.y = -150;
			range.grid.stroke = am4core.color("#396478");
			range.grid.strokeWidth = 1;
			range.grid.strokeOpacity = 0.5;

			range.label.events.on("ready",()=>range.label.y = -150);
			
			range.axisFill.hoverable = true;
			range.axisFill.events.on("hover",()=>{
				console.log(i);
			});
			range.axisFill.events.on("out",()=>{
				console.log(i);
			});
			
		}
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
		

		function createBitrateSerie(name,field,colorValue)
		{
			//create color
			const color = am4core.color(colorValue || colorHash.hex ("medooze"+name));
			//Create serie
			const serie = chart.series.push (new am4charts.LineSeries ());
			serie.name = name;
			serie.dataFields.dateX = Metadata.ts;
			serie.dataFields.valueY = field;
			serie.yAxis = mbpsAxis;
			//bweSeries.xAxis = sentAxis;
			serie.tooltipText = "{name}: {valueY.formatNumber(\"#.###a'bps'\")}";
			serie.fill = color;
			serie.stroke = color;
			serie.startLocation = 0;
			serie.connect = false;
			serie.autoGapCount = 100;
			//Done
			return serie;
		}
		
		let i = 0;
		//Create all the series
		createBitrateSerie("Long Term BWE"	, Metadata.bwe			, colors[i++]);
		createBitrateSerie("BWE"		, Metadata.available		, colors[i++]);
		createBitrateSerie("Target"		, Metadata.target		, colors[i++]);
		createBitrateSerie("Total Sent"		, Metadata.bitrateSent		, colors[i++]);
		createBitrateSerie("Total Received"	, Metadata.bitrateRecv		, colors[i++]);
		createBitrateSerie("Media"		, Metadata.bitrateMedia		, colors[i++]);
		createBitrateSerie("RTX"		, Metadata.bitrateRTX		, colors[i++]);
		createBitrateSerie("Probing"		, Metadata.bitrateProbing	, colors[i++]);
	}

	//Create state series an axis
	{
		//Get milliseconds chart
		const chart = charts.mbps;
		//Create axis
		var stateAxis = chart.yAxes.push (new am4charts.ValueAxis());
		stateAxis.renderer.labels.template.fill = am4core.color(colorHash.hex("State"));
		stateAxis.numberFormatter = new am4core.NumberFormatter ();
		stateAxis.numberFormatter.numberFormat = "#'%'";;
		stateAxis.renderer.labels.template.fill = am4core.color (colorHash.hex ("state"));
		stateAxis.renderer.maxWidth = stateAxis.renderer.minWidth = 120;
		stateAxis.renderer.opposite = true;
		stateAxis.renderer.grid.template.strokeOpacity = 0.07;
		stateAxis.tooltip.disabled = true;
		stateAxis.min = stateAxis.minDefined = 0;
		stateAxis.max = stateAxis.maxDefined = 6;

		function createStateSeries(name,field,colorValue)
		{
			//create color
			const color = am4core.color(colorValue || colorHash.hex ("medooze"+name));
			//Create serie
			var serie = chart.series.push (new am4charts.LineSeries ());
			serie.name = name;
			serie.dataFields.dateX = Metadata.ts;
			serie.dataFields.valueY = field;
			serie.yAxis = stateAxis;
			serie.tooltipText = "{name}: {valueY}";
			serie.fill = color;
			serie.stroke = color;
			serie.startLocation = 0;
			serie.connect = false;
			serie.autoGapCount = 100;
			//Done
			return serie;
		}
		
		createStateSeries("state"		, Metadata.state, "#FF0000");
	}

	//Create lost series and axis
	{
		//Get milliseconds chart
		const chart = charts.ms;
		//Create axis
		var lostAxis = chart.yAxes.push (new am4charts.ValueAxis ());
		lostAxis.renderer.labels.template.fill = am4core.color(colorHash.hex("Lost"));
		lostAxis.numberFormatter = new am4core.NumberFormatter ();
		lostAxis.numberFormatter.numberFormat = "#'%'";
		lostAxis.renderer.labels.template.fill = am4core.color (colorHash.hex ("Lost"));
		lostAxis.renderer.maxWidth = lostAxis.renderer.minWidth = 120;
		lostAxis.renderer.opposite = true;
		lostAxis.renderer.grid.template.strokeOpacity = 0.07;
		lostAxis.tooltip.disabled = true;
		lostAxis.min = lostAxis.minDefined = 0;
		

		function createPercentageSeries(name,field,colorValue)
		{
			//create color
			const color = am4core.color(colorValue || colorHash.hex ("medooze"+name));
			//Create serie
			var serie = chart.series.push (new am4charts.LineSeries ());
			serie.name = name;
			serie.dataFields.dateX = Metadata.ts;
			serie.dataFields.valueY = field;
			serie.yAxis = lostAxis;
			serie.tooltipText = "{name}: {valueY}%";
			serie.fill = color;
			serie.stroke = color;
			serie.startLocation = 0;
			serie.connect = false;
			serie.autoGapCount = 100;
			//Done
			return serie;
		}
		
		createPercentageSeries("Lost"		, Metadata.lost, "#FF0000");
	}

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

		function createMSSeries(name,field,colorValue)
		{
			//create color
			const color = am4core.color(colorValue || colorHash.hex ("medooze"+name));
			//Create serie
			const serie = chart.series.push (new am4charts.LineSeries ());
			serie.name = name;
			serie.dataFields.dateX = Metadata.ts;
			serie.dataFields.valueY = field;
			serie.yAxis = msAxis;
			serie.tooltipText = "{name}: {valueY}ms";
			serie.fill = color;
			serie.stroke = color;
			serie.startLocation = 0;
			serie.connect = false;
			serie.autoGapCount = 100;
			//Done
			return serie;
		}
		
		let i = 0;
		createMSSeries("RTT"		, Metadata.rtt			, colors[i++]);
		createMSSeries("Min RTT"	, Metadata.minrtt		, colors[i++]);
		createMSSeries("Estimated RTT"	, Metadata.estimatedrtt		, colors[i++]);
		createMSSeries("Network delay"	, Metadata.delay		, colors[i++]);
		createMSSeries("Feedback delay"	, Metadata.fbDelay		, colors[i++]);
		createMSSeries("Delta acumulated", Metadata.deltaAcumulated	, colors[i++]);
		createMSSeries("Detla instant"	, Metadata.deltaInstant		, colors[i++]);
		
	}
}

