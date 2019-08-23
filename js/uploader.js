'use strict';

function OnFileUpload (form,callback)
{
	const input = form.querySelector ('input[type="file"]');
	let droppedFiles = false;
	const triggerFormSubmit = function (files) {
		droppedFiles = files;
		var event = document.createEvent ('HTMLEvents');
		event.initEvent ('submit', true, false);
		form.dispatchEvent (event);
	};

	// automatically submit the form on file select
	input.addEventListener ('change', () => triggerFormSubmit ());

	['drag', 'dragstart', 'dragend', 'dragover', 'dragenter', 'dragleave', 'drop'].forEach (function (event)
	{
		form.addEventListener (event, (e) =>
		{
			// preventing the unwanted behaviours
			e.preventDefault ();
			e.stopPropagation ();
		});
	});
	['dragover', 'dragenter'].forEach (function (event)
	{
		form.addEventListener (event, () => form.classList.add ('is-dragover'));
	});
	['dragleave', 'dragend', 'drop'].forEach (function (event)
	{
		form.addEventListener (event, () => form.classList.remove ('is-dragover'));
	});

	form.addEventListener ('drop', (e) => triggerFormSubmit (e.dataTransfer.files));

	// if the form was submitted
	form.addEventListener ('submit', function (e)
	{
		// preventing the duplicate submissions if the current one is in progress
		if (form.classList.contains ('is-uploading'))
			return false;

		form.classList.add ('is-uploading');

		e.preventDefault ();

		// gathering the form data
		const file = droppedFiles ? droppedFiles[0] : input.files[0];
		
		const fr = new FileReader ();
		fr.onload = () => { form.classList.remove ('is-uploading'),callback(file.name,fr.result) };
		fr.readAsText (file);
	});

	// Firefox focus bug fix for file input
	input.addEventListener ('focus', () => input.classList.add ('has-focus'));
	input.addEventListener ('blur', () => input.classList.remove ('has-focus'));

}
