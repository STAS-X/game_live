// Экспортируем в Worker функции для работы с данными хранилища игры
importScripts('promise.js', 'helpers.js');

// Количество асинхронных итераций на которые делится вычислительный процесс для функций с использованием Promise
const partsCount = 10;

// Название класса для шаблонного DIV клетки поля
const divTemplateClass = 'fieldCell';

const GameKeeper = {
	storage: {
		firstFrameOfGame: new Map(), // Map хранения состояния игры на первом шаге
		prevGameFields: new Map(), // Map хранения состояния игры на текущем шаге
		nextGameFields: new Map(), // Map хранения состояния игры на следующем шаге
		history: [] // Массив для хранения истории карт предыдущих шагов для проверки на повторение таких шагов в будущем
	},
	samples: {
		sampleFigurePadding: [
			'2552',
			'0742',
			'69a4',
			'6996',
			'2520',
			'2170',
			'0660',
			'0db0',
			'25a4',
			'0256',
			'35ac',
			'2470',
			'0712',
		], // Маска заполнения начальными фигурами для старта игры в HEX формате
		sampleToFields: [], // Преобразование маски в бинарный вид для первичного заполнения поля игры  2 => 0100; 10 => 0101
		startSamples: [], // Массив для хранения изначально сгенерированных случайных фигур для добавления на игровое поле на первом шаге
		minSamplesCount: 2, // Минимальное количество клеток для поля 10x10
	},
};

const GameStatus = {
	loading: 1,
	pause: 2,
	play: 3,
	reconfig: 4,
	idle: 5,
};

const GameMessages = {
	updateStatus: 'changeGameStatus',
	updateComponentTree: 'updateFieldComponents',
};

const IncommingMessages = {
	pause: 'GamePause',
	play: 'GamePlay',
	end: 'GameEnd',
	reconfig: 'GameReconfig',
	idle: 'GameIdle',
	close: 'CloseWorker',
};

onmessage = async (event) => {
	const { message, params } = event.data;

	const { rows, cellwidth, status, step } = params || {};

	try {
		switch (message) {
			// Блок приема сообщения о запуске новой игры
			case IncommingMessages['play']:
				if (status === GameStatus['idle']) {
					GameKeeper.storage.history=[];
					await calcWithPromises(synchronizeGameSteps(rows, GameKeeper.storage.firstFrameOfGame));
				}
				if (status !== GameStatus['play'])
					postMessage({ message: GameMessages['updateStatus'], params: { status: GameStatus['play'] } });

				if (step > 0) {
					await calcWithPromises(
						synchronizeGameSteps(rows, GameKeeper.storage.nextGameFields, GameKeeper.storage.prevGameFields)
					);
				}

				await calcWithPromises(calculateNextStepOfGame(rows));

				// Проверка на признаки завершения игры
				if (checkForEndGame(rows)) {
					//postMessage({ message: GameMessages['updateStatus'], params: { status: GameStatus['idle'] } });
					break;
				}
				const resultDivsTree = await calcWithPromises(generateDivsMap(rows, cellwidth));
				postMessage({ message: GameMessages['updateComponentTree'], params: { divTreeData: resultDivsTree } });

				break;
			// Блок приема сообщения о постановке игры на паузу
			case IncommingMessages['pause']:
				postMessage({ message: GameMessages['updateStatus'], params: { status: GameStatus['pause'] } });
				break;
			// Блок приема сообщения об изменении текущей конфигурации игры
			case IncommingMessages['reconfig']:
				postMessage({
					message: GameMessages['updateStatus'],
					params: { status: GameStatus['reconfig'] },
				});
				const resultReconfigTree = await applyCurrentSettingsToField(rows, cellwidth);
				postMessage({
					message: GameMessages['updateComponentTree'],
					params: { divTreeData: resultReconfigTree },
				});
				break;
			// Блок приема сообщения о переходе в режим ожидания
			case IncommingMessages['idle']:
				postMessage({ message: GameMessages['updateStatus'], params: { status: GameStatus['idle'] } });
				break;
		}
	} catch ({ name, message }) {
		postMessage({
			message: GameMessages['updateStatus'],
			params: { status: GameStatus['idle'], errorMessage: `Произошла ошибка(${name}): ${message}` },
		});
		console.log(`Произошла ошибка(${name}): ${message}`);
	}
};
