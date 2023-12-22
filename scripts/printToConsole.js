export function oopsToConsole(value) {
	console.log('Oops, somthing went wrong...', value ?? '');
}

export function errorToConsole(err) {
	oopsToConsole();
	console.error(err);
}
