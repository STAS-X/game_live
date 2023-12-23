// Блок асинхронных функций (на базе Promise) для работы с данными игры

// Функция для разделения процесса калькуляции на partsCount частей и запуска ожидания завершения процесса через Promise.all
async function calcWithPromises(funcToCalcByParts) {
	const promises = [];

	for (let i = 0; i < partsCount; i++) {
		promises.push(
			new Promise((resolve, reject) => {
				resolve(funcToCalcByParts(i));
			})
		);
	}

	return Promise.all(promises).then((values) => {
		if (typeof values[0] === 'object') {
			return values.reduce((accum, value) => {
				return new Map([...accum, ...value]);
			}, new Map());
		}

		return values.reduce((accum, value) => {
			return accum.concat(value || '', '|');
		}, '');
	});
}

// Функция для проверки условий завершения игры
function checkForEndGame(count) {
	let emptyFieldsCount = 0;
	let fieldsByFirstFrame = 0;
	let identityFields = 0;

	//if (status !== GameStatus['play']) return false;

	// Проверка на отсутствие живых клеток на поле
	for (const lineField of GameKeeper.storage.prevGameFields.values()) {
		emptyFieldsCount += lineField.filter((item) => item === 0).length;
	}

	// Проверка на отсутствие изменений между шагами
	//if (step > 0)
	for (let i = 0; i < GameKeeper.storage.prevGameFields.size; i++) {
		const prevLine = GameKeeper.storage.prevGameFields.get(i);
		const identityLine = GameKeeper.storage.nextGameFields.get(i);
		identityFields += identityLine.filter((value, index) => prevLine[index] === value).length;
	}

	// Проверка на возвращение сцены к одному из предыдущих шагов
	//if (step > 0)
	if (GameKeeper.storage.history.length === 0)
		GameKeeper.storage.history.push(mapToRLE(GameKeeper.storage.firstFrameOfGame));
	const newHistory = mapToRLE(GameKeeper.storage.nextGameFields);
	GameKeeper.storage.history.forEach((item) => {
		if (item === newHistory) fieldsByFirstFrame = 1;
	});
	if (fieldsByFirstFrame === 0) GameKeeper.storage.history.push(newHistory);
	// for (let i = 0; i < GameKeeper.storage.nextGameFields.size; i++) {
	// 	const prevLine = GameKeeper.storage.nextGameFields.get(i);
	// 	const firstLine = GameKeeper.storage.firstFrameOfGame.get(i);
	// 	fieldsByFirstFrame += firstLine.filter((value, index) => prevLine[index] === value).length;
	// }

	// В случае, если живых клеток не найдено, если повторилась конфигурация первого шага или картина между шагами не поменялась , заканчиваем игру
	if (emptyFieldsCount === Math.pow(count, 2))
		postMessage({
			message: GameMessages['updateStatus'],
			params: { status: GameStatus['idle'], statusMessage: 'Живые клетки отсутствуют' },
		});
	else if (identityFields === Math.pow(count, 2))
		postMessage({
			message: GameMessages['updateStatus'],
			params: { status: GameStatus['idle'], statusMessage: 'Статичная конфигурация поля игры' },
		});
	else if (fieldsByFirstFrame === 1)
		postMessage({
			message: GameMessages['updateStatus'],
			params: { status: GameStatus['idle'], statusMessage: 'Повторилась предыдущая конфигурация игры' },
		});

	return (
		emptyFieldsCount === Math.pow(count, 2) ||
		fieldsByFirstFrame === Math.pow(count, 2) ||
		identityFields === Math.pow(count, 2)
	);
}

// Функция расчета поля следующего шага игры
const calculateNextStepOfGame = (count) => async (partId) => {
	const partStart = (partId * count) / partsCount;
	const partEnd = ((partId + 1) * count) / partsCount;

	for (let i = partStart; i < partEnd; i++) {
		const prevRow = GameKeeper.storage.prevGameFields.get((i - 1 + count) % count);
		let currentRow = GameKeeper.storage.prevGameFields.get(i);
		const nextRow = GameKeeper.storage.prevGameFields.get((i + 1) % count);

		// Проверяем на условие гибели клетки и/или появления новой клетки
		// В случае гибели зануляем текущую клетку поля, в ином случае добавляем нового игрока
		currentRow = currentRow.map((value, index, arr) => {
			const aroundLiveCount =
				prevRow[(index - 1 + count) % count] +
				prevRow[index % count] +
				prevRow[(index + 1) % count] +
				arr[(index - 1 + count) % count] +
				//arr[index % count] +
				arr[(index + 1) % count] +
				nextRow[(index - 1 + count) % count] +
				nextRow[index % count] +
				nextRow[(index + 1) % count];

			if ((value === 1 && (aroundLiveCount === 2 || aroundLiveCount === 3)) || (value === 0 && aroundLiveCount === 3))
				return 1;
			return 0;
		});
		GameKeeper.storage.nextGameFields.set(i, [...currentRow]);
	}
};

// Функция синхронизации предыдущего и следующего шагов игры для последующего генерирования дерева DIV элементов
const synchronizeGameSteps = (count, fromFieldStep, toFieldStep) => async (partId) => {
	const partStart = (partId * Math.pow(count, 2)) / partsCount;
	const partEnd = ((partId + 1) * Math.pow(count, 2)) / partsCount;

	for (let i = partStart; i < partEnd; i++) {
		const currentRow = fromFieldStep.get(i);
		if (currentRow) {
			if (toFieldStep) {
				toFieldStep.set(i, [...currentRow]);
			} else {
				GameKeeper.storage.prevGameFields.set(i, [...currentRow]);
				GameKeeper.storage.nextGameFields.set(i, [...currentRow]);
			}
		}
	}
};

// Функция для применения текущих настроек в конфигурации игры и построения нового поля игры
const applyCurrentSettingsToField = async (count, cellwidth) => {
	await calcWithPromises(fillNullishFields(count)); // Обнуляем значения ячеек исходного поля игры через асинхронность
	generateStartSamplesForField(count); // Генерируем карту начального значения ячеек игры
	transformSamplesToField(count); // Заполняем значения массива исходного поля игры текущими значениями для 1-го шага игры
	// Формируем выходное дерево DIV элементов и заполняем их на основании карты игрового поля текущем шаге
	const resultFields = await calcWithPromises(generateDivsMap(count, cellwidth, true));

	//if (resultFields) fieldsContainer.innerHTML = resultFields;
	return resultFields;
};

// Функция генерации игрового блока элементов игры на основе DIV элементов
const generateDivsMap =
	(count, cellwidth, isreset = false) =>
	async (partId) => {
		let fieldsResult = '';
		const partStart = (partId * Math.pow(count, 2)) / partsCount;
		const partEnd = ((partId + 1) * Math.pow(count, 2)) / partsCount;

		let column = -1;
		let currentRow = [];
		let nextRow = [];

		for (let i = partStart; i < partEnd; i++) {
			const row = i % count;

			if (column != Math.floor(i / count)) {
				column = Math.floor(i / count);
				currentRow = GameKeeper.storage.prevGameFields.get(column);
				nextRow = GameKeeper.storage.nextGameFields.get(column);
			}

			const newValue = isreset
				? currentRow[row] === 0
					? 0
					: 2
				: count < 60
				? nextRow[row] === currentRow[row]
					? nextRow[row]
					: nextRow[row] === 1
					? 2
					: -1
				: currentRow[row];

			fieldsResult = fieldsResult.concat(
				`<div id="${''.concat(
					row + 1,
					'_',
					column + 1
				)}" onMouseEnter="gameSettings.functions.changeCellAriaValue(event);" class="${divTemplateClass}" aria-value="${newValue}" style="width: ${cellwidth}; height: ${cellwidth}"></div>`
			);
		}

		return fieldsResult;
	};

// Инициализации разделов по хранению текущих шагов полей игры
const fillNullishFields = (count) => async (partId) => {
	if (partId === 0) {
		GameKeeper.storage.firstFrameOfGame.clear();
		GameKeeper.storage.prevGameFields.clear();
		GameKeeper.storage.nextGameFields.clear();
	}

	//const partStart = (partId * Math.pow(count, 2)) / GameSettings.partsCount;
	//const partEnd = ((partId + 1) * Math.pow(count, 2)) / GameSettings.partsCount;
	const initArray = Array.from({ length: count }, (_, k) => 0);

	for (let i = 0; i < count; i++) {
		GameKeeper.storage.prevGameFields.set(i, [...initArray]);
		GameKeeper.storage.nextGameFields.set(i, [...initArray]);
		GameKeeper.storage.firstFrameOfGame.set(i, [...initArray]);
	}
};

// Генерация текущего поля игры путем случайного заполнения шаблонными элементами
function generateStartSamplesForField(maxFieldRows) {
	const sample = { x: 0, y: 0, mask: '' };
	const sampleRows = GameKeeper.samples.sampleFigurePadding[0].length;
	GameKeeper.samples.startSamples = [];
	let i = 0;

	// Рассчитываем общее количество начальных клеточных образований для добавления на доску ( 2 + 3 на каждые 10 клеток поля начиная с 20-клеточного поля)
	const maxSamplesCount = GameKeeper.samples.minSamplesCount + 3 * Math.floor((maxFieldRows - 10) / 10);

	while (GameKeeper.samples.startSamples.length < maxSamplesCount) {
		sample.x = getRandomValue(0, maxFieldRows - 1);
		sample.y = getRandomValue(0, maxFieldRows - 1);
		sample.mask = GameKeeper.samples.sampleFigurePadding.at(
			getRandomValue(0, GameKeeper.samples.sampleFigurePadding.length - 1)
		);

		if (GameKeeper.samples.startSamples.length > 0) {
			if (
				GameKeeper.samples.startSamples.findIndex(
					(item) =>
						Math.sqrt(Math.pow(sample.x - item.x, 2) + Math.pow(sample.y - item.y, 2)) < sampleRows ||
						Math.sqrt(
							Math.pow(((sample.x + sampleRows - 1) % maxFieldRows) - ((item.x + sampleRows - 1) % maxFieldRows), 2) +
								Math.pow(((sample.y + sampleRows - 1) % maxFieldRows) - ((item.y + sampleRows - 1) % maxFieldRows), 2)
						) < sampleRows
				) < 0
			)
				GameKeeper.samples.startSamples.push({ ...sample });
		} else GameKeeper.samples.startSamples.push({ ...sample });
	}
}

// Преобразование шаблонных заполнителей элементов игры в клетки на поле
function transformSamplesToField(maxFieldRows) {
	if (GameKeeper.samples.startSamples.length === 0) return;

	for (const sample of GameKeeper.samples.startSamples) {
		GameKeeper.samples.sampleToFields = sample.mask.split('').map((alpha) =>
			convertFromNumber(alpha)
				.split('')
				.map((value) => Number(value))
		);
		for (let i = 0; i < GameKeeper.samples.sampleToFields.length; i++) {
			const prevValues = GameKeeper.storage.prevGameFields.get((sample.y + i) % maxFieldRows);
			const sampleField = GameKeeper.samples.sampleToFields[i];
			for (let j = 0; j < GameKeeper.samples.sampleToFields.length; j++) {
				if (prevValues[(sample.x + j) % maxFieldRows] !== sampleField[j]) {
					prevValues[(sample.x + j) % maxFieldRows] = sampleField[j];
				}
			}
			GameKeeper.storage.firstFrameOfGame.set((sample.y + i) % maxFieldRows, [...prevValues]);
			GameKeeper.storage.prevGameFields.set((sample.y + i) % maxFieldRows, [...prevValues]);
		}
	}
}
