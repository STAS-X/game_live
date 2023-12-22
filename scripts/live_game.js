import { errorToConsole } from './printToConsole.js';

// Типы статуса игры
const GameStatus = {
	loading: 1,
	pause: 2,
	play: 3,
	reconfig: 4,
	idle: 5,
};

// Cообщения для Worker
const WorkerMessages = {
	pause: 'GamePause',
	play: 'GamePlay',
	reconfig: 'GameReconfig',
	idle: 'GameIdle',
	close: 'CloseWorker',
};

// Входящие сообщения от Worker
const IncommingMessages = {
	updateStatus: 'changeGameStatus',
	updateComponentTree: 'updateFieldComponents',
};

// Создаем новый экземпляр DedicateWorker для распараллеливания рассчета нового шага игры
let worker = null;

// Функция для приема сообщений от Worker-а
const workerOnMessage = async (e) => {
	const { message, params } = e.data;

	switch (message) {
		case IncommingMessages['updateStatus']:
			const { status, errorMessage, statusMessage } = params;
			// Если мы хотим сбросить статус текущий игры на нейтральный запускаем процедуру завершения игры
			if (GameSettings.current.currentStatus === GameStatus['play'] && status === GameStatus['idle']) end_game();
			if (status === GameStatus['idle']) {
				if (errorMessage || statusMessage) {
					console.warn(errorMessage || statusMessage, 'game is over');
				}
			}
			updateStatus(status, statusMessage, errorMessage);
			GameSettings.current.currentStatus = status;

			break;
		case IncommingMessages['updateComponentTree']:
			const { divTreeData } = params;
			await injectedDivToDomNode(divTreeData);
			if (GameSettings.current.currentStatus !== GameStatus['reconfig']) {
				GameSettings.current.currentStep++;
				GameSettings.global.calculatingStep--;
				updateStepNumber();
			} else setTimeout(() => GameSettings.current.components.loader.classList.toggle('open'), 250);
	}
};

// Глобальный объект для хранения текущей конфигурации игры
export const GameSettings = {
	global: {
		partsCount: 10, // Количество частей, на которые делится игровое поле при обработке каждого хода игры и первичном заполнении
		calculatingStep: 0, // признак осуществления текущего расчета поля игры
		currentTimerId: -1, // Текущий timerId для зацикливания основной процедуры обработчика игры до ее принудительной остановки или завершения
		startTime: 0, // Время начала игры, для подсчета общего времени продолжительности
		timerId: -1, // Текущий timerId для обновления
	},
	current: {
		fieldsPerRowCount: 10, // Текущее количество строк и столбцов на поле игры
		minSamplesCount: 2, // Количество исходных фигур для заполнения игрового поля на первом шаге
		timeSpan: 1000, // Задержка каждого хода игры в милисекундах;
		currentStatus: GameStatus['idle'], // Текущий статус игры
		currentStep: 0, // Текущий ход игры
		cellWidth: '0px', // Текущее значение размеров ячейки игры
		components: {
			fieldContainer: null,
			mainContainer: null,
			counter: null,
			loader: null,
			timer: null,
		},
	},
	functions: {
		initializeGameSettings: update_settings_game, // Начальная функция ждя загрузки исходных настроек игры
		startLiveGame: start_game, // Функция начала игры
		resumeLiveGame: resume_game, // Функция приостановки и возобновления игры
	},
};

// Получаем исходные объекты HTML страницы для последующего использования в игре
GameSettings.current.components.counter = document.querySelector('#fields_counter');
if (!GameSettings.current.components.counter) {
	errorToConsole('Fieds counter input element not found!');
}

GameSettings.current.components.timer = document.querySelector('#fields_timer');
if (!GameSettings.current.components.timer) {
	errorToConsole('Fieds timer input element not found!');
}

GameSettings.current.components.fieldContainer = document.querySelector('#fields_container');
if (!GameSettings.current.components.fieldContainer) {
	errorToConsole('Fieds container not found!');
}

GameSettings.current.components.loader = document.querySelector('#loader');
if (!GameSettings.current.components.loader) {
	errorToConsole('Loader not found!');
}

GameSettings.current.components.gameover = document.querySelector('#gameover');
if (!GameSettings.current.components.gameover) {
	errorToConsole('GameOver not found!');
}

GameSettings.current.components.mainContainer = document.querySelector('main');

// Функция по пересозданию Worker-a для распараллеливания вычислительного процесса
function recreateWorker() {
	if (worker) worker.terminate();

	worker = new Worker('scripts/worker.js', {});
	worker.onmessage = workerOnMessage;
}

// Функция конфигурирования начальных настроек игры во время первой загрузки
function update_settings_game() {
	recreateWorker();

	GameSettings.current.components.loader.classList.toggle('open');
	// Устанавливаем текущие настройки игры
	const counterValue = !isNaN(GameSettings.current.components.counter.value)
		? parseInt(GameSettings.current.components.counter.value) >= 10 &&
		  parseInt(GameSettings.current.components.counter.value) <= 100
			? Math.floor(parseInt(GameSettings.current.components.counter.value)/10)*10
			: 10
		: 10;
	const timerValue = !isNaN(GameSettings.current.components.timer.value)
		? parseInt(GameSettings.current.components.timer.value) >= 500 &&
		  parseInt(GameSettings.current.components.timer.value) <= 5000
			? Math.floor(parseInt(GameSettings.current.components.timer.value) / 10) * 10
			: 1000
		: 1000;
	GameSettings.current.fieldsPerRowCount = counterValue; //parseInt(GameSettings.current.components.counter.value);
	GameSettings.current.timeSpan = timerValue; //parseInt(GameSettings.current.components.timer.value);

	document.documentElement.style.setProperty('--animateVelocity', `${GameSettings.current.timeSpan}ms`);
	document.documentElement.style.setProperty('--stepOpacity', 0);

	clearSettingsGame();

	// Удаляем все компоненты (игровые ячейки) контейнера игрового поля
	GameSettings.current.components.fieldContainer.innerHTML = '';

	GameSettings.current.cellWidth = `${parseFloat(
		GameSettings.current.components.fieldContainer.getBoundingClientRect().height /
			GameSettings.current.fieldsPerRowCount
	).toFixed(2)}px`;

	GameSettings.current.components.mainContainer.style.width = `${
		parseFloat(
			GameSettings.current.components.fieldContainer.getBoundingClientRect().height /
				GameSettings.current.fieldsPerRowCount
		).toFixed(2) * GameSettings.current.fieldsPerRowCount
	}px`;

	// Округляем высоту игрового поля
	GameSettings.current.components.fieldContainer.style.height = `${
		Math.floor(GameSettings.current.components.fieldContainer.getBoundingClientRect().height / 10) * 10
	}px`;

	worker.postMessage({
		message: WorkerMessages['reconfig'],
		params: {
			rows: GameSettings.current.fieldsPerRowCount,
			cellwidth: GameSettings.current.cellWidth,
		},
	});
}

// Инициализация текущих настроек игры
function clearSettingsGame(isClearAll) {
	if (GameSettings.global.currentTimerId > -1) {
		clearInterval(GameSettings.global.currentTimerId);
		GameSettings.global.currentTimerId = -1;
	}
	if (GameSettings.global.timerId > -1) {
		clearInterval(GameSettings.global.timerId);
		GameSettings.global.timerId = -1;
	}

	if (isClearAll) {
		GameSettings.global.startTime = performance.now();
		GameSettings.global.calculatingStep = 0;
		GameSettings.current.currentStep = 0;
		GameSettings.current.currentStatus = GameStatus['idle'];
		updateStepNumber(true);
		updateTimer();
	}
}

// Функция для начала новой игры
function start_game(isrestart = true) {
	if (isrestart) clearSettingsGame(true);

	// Запускаем неотложный пересчет поля игры для моментального запуска
	start_calculation();
	// Запускаем пересчет поля игры в цикле с периодом повторения timeSpan (мс)
	GameSettings.global.currentTimerId = setInterval(start_calculation, GameSettings.current.timeSpan);
	GameSettings.global.timerId = setInterval(updateTimer, 1000);
}

// Функция непосредственного расчета и визуализации текущего шага игры
function start_calculation() {
	// В случае, если продолжает идти расчет выходим из процедуры, до его завершения
	if (GameSettings.global.calculatingStep > 0) return;

	GameSettings.global.calculatingStep++;

	worker.postMessage({
		message: WorkerMessages['play'],
		params: {
			rows: GameSettings.current.fieldsPerRowCount,
			status: GameSettings.current.currentStatus,
			step: GameSettings.current.currentStep,
			cellwidth: GameSettings.current.cellWidth,
		},
	});
}

// Функция завершения игры
function end_game() {
	if (GameSettings.current.currentStatus === GameStatus['play']) {
		clearSettingsGame();
		document.documentElement.style.setProperty('--stepOpacity', 0);
		GameSettings.current.components.gameover.classList.toggle('finishopen');
		setTimeout(() => GameSettings.current.components.gameover.classList.toggle('finishopen'), 6000);
	}
}

// Функция паузы/продолжения игры
function resume_game() {
	if (GameSettings.current.currentStatus === GameStatus['play']) {
		clearSettingsGame();
		worker.postMessage({
			message: WorkerMessages['pause'],
		});
		updateStepNumber(true);
		document.documentElement.style.setProperty('--stepOpacity', 0);
		document.querySelector('input.button__pause').value = 'Продолжить';
	} else if (GameSettings.current.currentStatus === GameStatus['pause']) {
		start_game(false);
		document.querySelector('input.button__pause').value = 'Пауза';
	}
}

// Функция обновления текущего счетчика времени продолжительности игры
function updateTimer() {
	const spanTime = performance.now() - GameSettings.global.startTime;
	const hours = Math.floor(spanTime / 1000 / 3600);
	const mins = Math.floor((spanTime / 1000 - hours * 3600) / 60);
	const sec = Math.floor(spanTime / 1000 - hours * 3600 - mins * 60);
	document.querySelector('span#game_timer').innerText = `${hours < 10 ? '0' + hours : hours}:${
		mins < 10 ? '0' + mins : mins
	}:${sec < 10 ? '0' + sec : sec}`;
}

// Функция отображения текущего статуса игры при его изменении
function updateStatus(status, extraMessage, errorMessage) {
	switch (status) {
		case GameStatus['play']:
			if (GameSettings.current.currentStatus === GameStatus['pause']) {
				document.querySelector('span#game_status').innerText = 'игра продолжена';
			} else document.querySelector('span#game_status').innerText = 'игра начата';
			break;
		case GameStatus['pause']:
			document.querySelector('span#game_status').innerText = 'игра остановлена';
			break;
		case GameStatus['reconfig']:
			document.querySelector('span#game_status').innerText = 'перезапуск игры';
			break;
		case GameStatus['idle']:
			if (extraMessage) {
				document.querySelector('span#game_status').innerText = 'игра окончена';
				console.info(`Игра завершена по следующей причине: ${extraMessage}`);
			} else if (errorMessage) {
				document.querySelector('span#game_status').innerText =
					'игра завершена по причине ошибки на сервере (см. консоль)';
				errorToConsole(`Игра завершена в результате ошибки на сервере: ${errorMessage}`);
			} else document.querySelector('span#game_status').innerText = 'режим ожидания';
	}
}

// Функция обновления счетчика текущего шага игры
function updateStepNumber(isreset = false) {
	const root = document.documentElement;
	if (isreset) {
		root.style.setProperty('--stepIn', 0);
		root.style.setProperty('--stepOut', 0);
		root.style.setProperty('--stepOpacity', 0);
	} else {
		if (GameSettings.current.fieldsPerRowCount < 50) {
			root.style.setProperty('--stepIn', `'${GameSettings.current.currentStep}'`);
			root.style.setProperty('--stepOut', `'${GameSettings.current.currentStep - 1}'`);
			root.style.setProperty('--stepOpacity', 1);
			document.getAnimations().forEach((animate) => {
				if (animate.animationName === 'stepOut' || animate.animationName === 'stepIn') {
					animate.cancel();
					animate.play();
				}
			});
		}
		document.querySelector('span#game_step').innerText = GameSettings.current.currentStep;
	}
}

// Функция обновления (визуализации) текщего шага игры после рассчета поля
async function injectedDivToDomNode(divsData) {
	const promises = [];
	const divsArray = divsData.split('|');
	GameSettings.current.components.fieldContainer.innerHTML = '';
	let currentPartId = 0;

	const addPartialDivsToDom = async (partialId) => {
		return new Promise(async (resolve) => {
			while (currentPartId !== partialId) {
				await sleep(50);
			}
			currentPartId++;
			GameSettings.current.components.fieldContainer.insertAdjacentHTML('beforeend', divsArray[partialId]);
			resolve('injection completed');
		});
	};

	// Функция засыпания для соблюдения последовательности инжектирования элементов в поля игры
	const sleep = async (ms) => {
		return new Promise((resolve) => setTimeout(resolve, ms));
	};

	for (let i = 0; i < divsArray.length; i++) {
		promises.push(addPartialDivsToDom(i));
	}

	return Promise.all(promises).then(() => console.log('divs injected to field container'));
}

window.gameSettings = GameSettings;

window.onload = update_settings_game;
