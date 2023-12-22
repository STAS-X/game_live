// Функуия возвращает случайное число в установленных пределах
function getRandomValue(vMin = 0, vMax = 10) {
	return vMin + Math.floor(Math.random() * (vMax - vMin));
}

// Функция преобразует букво символ из базовой системы счисления в выходную
function convertFromNumber(n, fromBase = 16, toBase = 2, maxLength = 4) {
	if (fromBase === void 0) {
		fromBase = 10;
	}
	if (toBase === void 0) {
		toBase = 10;
	}
	return parseInt(n.toString(), fromBase).toString(toBase).split('').reverse().join('').padEnd(maxLength, '0');
}

// Функция сжатия последовательности символов по принципу алгоритма RLE
function stringToRLE(arr = []) {
	let result = '';
	let spliceIndex = 0;

	if (arr.length > 0) {
		while (arr.length > 0) {
			spliceIndex = arr.findIndex((value) => value !== arr[0]);
			result = result.concat(arr[0], parseInt(spliceIndex < 0 ? arr.length : spliceIndex).toString(16));
			arr.splice(0, spliceIndex < 0 ? arr.length : spliceIndex);
		}
	}
	return result;
}

// Функция для построения сжатой карты всего поля
function mapToRLE(mapData) {
	let result = '';
	for (let value of mapData.values()) {
		result = result.concat(stringToRLE([...value]));
	}
	return result;
}
