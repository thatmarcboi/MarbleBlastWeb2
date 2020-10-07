import { AudioManager } from "../audio";
import { ResourceManager, DirectoryStructure } from "../resources";
import { MissionElementSimGroup, MisParser, MissionElementType, MissionElementScriptObject } from "../parsing/mis_parser";
import { setupButton } from "./ui";
import { Util } from "../util";
import { homeScreenDiv } from "./home";
import { loadLevel } from "./loading";
import { secondsToTimeString } from "./game";
import { StorageManager } from "../storage";

interface Mission {
	path: string,
	simGroup: MissionElementSimGroup
}

export const beginnerLevels: Mission[] = [];
export const intermediateLevels: Mission[] = [];
export const advancedLevels: Mission[] = [];
export const customLevels: Mission[] = [];

export const levelSelectDiv = document.querySelector('#level-select') as HTMLDivElement;

const tabBeginner = document.querySelector('#tab-beginner') as HTMLImageElement;
const tabIntermediate = document.querySelector('#tab-intermediate') as HTMLImageElement;
const tabAdvanced = document.querySelector('#tab-advanced') as HTMLImageElement;
const tabCustom = document.querySelector('#tab-custom') as HTMLImageElement;
const levelTitle = document.querySelector('#level-title') as HTMLParagraphElement;
const levelDescription = document.querySelector('#level-description') as HTMLParagraphElement;
const levelQualifyTime = document.querySelector('#level-qualify-time') as HTMLParagraphElement;
const bestTime1 = document.querySelector('#level-select-best-time-1') as HTMLDivElement;
const bestTime2 = document.querySelector('#level-select-best-time-2') as HTMLDivElement;
const bestTime3 = document.querySelector('#level-select-best-time-3') as HTMLDivElement;
const levelImage = document.querySelector('#level-image') as HTMLImageElement;
const notQualifiedOverlay = document.querySelector('#not-qualified-overlay') as HTMLDivElement;
const levelNumberElement = document.querySelector('#level-number') as HTMLParagraphElement;
const prevButton = document.querySelector('#level-select-prev') as HTMLImageElement;
const playButton = document.querySelector('#level-select-play') as HTMLImageElement;
const nextButton = document.querySelector('#level-select-next') as HTMLImageElement;
const homeButton = document.querySelector('#level-select-home-button') as HTMLImageElement;
export const hiddenUnlocker = document.querySelector('#hidden-level-unlocker') as HTMLDivElement;

let currentLevelArray: Mission[];
let currentLevelIndex: number;

const selectTab = (which: 'beginner' | 'intermediate' | 'advanced' | 'custom') => {
	for (let elem of [tabBeginner, tabIntermediate, tabAdvanced, tabCustom]) {
		elem.style.zIndex = "-1";
	}

	let index = ['beginner', 'intermediate', 'advanced', 'custom'].indexOf(which);

	let elem = [tabBeginner, tabIntermediate, tabAdvanced, tabCustom][index];
	elem.style.zIndex = "0";

	let levelArray = [beginnerLevels, intermediateLevels, advancedLevels, customLevels][['beginner', 'intermediate', 'advanced', 'custom'].indexOf(which)];
	currentLevelArray = levelArray;
	currentLevelIndex = (StorageManager.data.unlockedLevels[['beginner', 'intermediate', 'advanced'].indexOf(which)] ?? 0) - 1;
	displayMission();
};

const setupTab = (element: HTMLImageElement, which: 'beginner' | 'intermediate' | 'advanced' | 'custom') => {
	element.addEventListener('mousedown', (e) => {
		if (e.button !== 0) return;
		AudioManager.play('buttonpress.wav');
	});
	element.addEventListener('click', (e) => e.button === 0 && selectTab(which));
};
setupTab(tabBeginner, 'beginner');
setupTab(tabIntermediate, 'intermediate');
setupTab(tabAdvanced, 'advanced');
setupTab(tabCustom, 'custom');

setupButton(prevButton, 'play/prev', () => cycleMission(-1), true);
setupButton(playButton, 'play/play', () => {
	let currentMission = currentLevelArray[currentLevelIndex];
	if (!currentMission) return;

	levelSelectDiv.classList.add('hidden');
	loadLevel(currentMission.simGroup, currentMission.path);
}, true);
setupButton(nextButton, 'play/next', () => cycleMission(1), true);
setupButton(homeButton, 'play/back', () => {
	levelSelectDiv.classList.add('hidden');
	hiddenUnlocker.classList.add('hidden');
	homeScreenDiv.classList.remove('hidden');
});

export const initLevelSelect = async () => {
	let missionDirectory = ResourceManager.dataDirectoryStructure['missions'];
	let missionFilenames: string[] = [];
	
	const collectMissionFiles = (directory: DirectoryStructure, path: string) => {
		for (let name in directory) {
			if (directory[name]) {
				collectMissionFiles(directory[name], path + name + '/');
			} else if (name.endsWith('.mis')) {
				missionFilenames.push(path + name);
			}
		}
	};
	collectMissionFiles(missionDirectory, '');

	let promises: Promise<MissionElementSimGroup>[] = [];
	for (let filename of missionFilenames) {
		promises.push(MisParser.loadFile("./assets/data/missions/" + filename));
	}

	let missions = await Promise.all(promises);
	let missionToFilename = new Map<MissionElementSimGroup, string>();
	for (let i = 0; i < missionFilenames.length; i++) {
		missionToFilename.set(missions[i], missionFilenames[i]);
	}

	missions.sort((a, b) => {
		let missionInfo1 = a.elements.find((element) => element._type === MissionElementType.ScriptObject && element._subtype === 'MissionInfo') as MissionElementScriptObject;
		let missionInfo2 = b.elements.find((element) => element._type === MissionElementType.ScriptObject && element._subtype === 'MissionInfo') as MissionElementScriptObject;

		return Number(missionInfo1.level) - Number(missionInfo2.level);
	});
	for (let mission of missions) {
		let filename = missionToFilename.get(mission);
		let missionInfo = mission.elements.find((element) => element._type === MissionElementType.ScriptObject && element._subtype === 'MissionInfo') as MissionElementScriptObject;
		let missionObj: Mission = { path: filename, simGroup: mission };

		if (missionInfo.type.toLowerCase() === 'beginner') beginnerLevels.push(missionObj);
		else if (missionInfo.type.toLowerCase() === 'intermediate') intermediateLevels.push(missionObj);
		else if (missionInfo.type.toLowerCase() === 'advanced') advancedLevels.push(missionObj);
		else customLevels.push(missionObj);
	}

	// Initiate loading some images like this
	selectTab('advanced');
	selectTab('intermediate');
	selectTab('beginner');
};

const displayMission = () => {
	let missionObj = currentLevelArray[currentLevelIndex];

	if (!missionObj) {
		notQualifiedOverlay.style.display = 'block';
		levelImage.style.display = 'none';
		levelTitle.innerHTML = '<br>';
		levelDescription.innerHTML = '<br>';
		levelQualifyTime.innerHTML = '';
		levelNumberElement.textContent = `Level ${currentLevelIndex + 1}`;

		playButton.src = './assets/ui/play/play_i.png';
		playButton.style.pointerEvents = 'none';
	} else {
		playButton.src = './assets/ui/play/play_n.png';
		playButton.style.pointerEvents = '';

		let unlockedLevels = StorageManager.data.unlockedLevels[[beginnerLevels, intermediateLevels, advancedLevels].indexOf(currentLevelArray)];

		if (unlockedLevels <= currentLevelIndex) {
			notQualifiedOverlay.style.display = 'block';
			playButton.src = './assets/ui/play/play_i.png';
			playButton.style.pointerEvents = 'none';
		} else {
			notQualifiedOverlay.style.display = 'none';
			playButton.src = './assets/ui/play/play_n.png';
			playButton.style.pointerEvents = '';
		}

		levelImage.style.display = '';
	
		let missionInfo = missionObj.simGroup.elements.find((element) => element._type === MissionElementType.ScriptObject && element._subtype === 'MissionInfo') as MissionElementScriptObject;
	
		levelTitle.textContent = missionInfo.name.replace(/\\n/g, '\n').replace(/\\/g, '');
		levelDescription.textContent = missionInfo.desc.replace(/\\n/g, '\n').replace(/\\/g, '');
		let qualifyTime = (missionInfo.time && missionInfo.time !== "0")? Number(missionInfo.time) : Infinity;
		levelQualifyTime.textContent = isFinite(qualifyTime)? "Time to Qualify: " + secondsToTimeString(qualifyTime / 1000) : '';
		let goldTime = Number(missionInfo.goldTime);

		let bestTimes = StorageManager.getBestTimesForMission(missionObj.path);
		bestTime1.children[0].textContent = '1. ' + bestTimes[0][0];
		(bestTime1.children[1] as HTMLImageElement).style.opacity = (bestTimes[0][1] <= goldTime)? '' : '0';
		bestTime1.children[2].textContent = secondsToTimeString(bestTimes[0][1] / 1000);
		bestTime2.children[0].textContent = '2. ' + bestTimes[1][0];
		(bestTime2.children[1] as HTMLImageElement).style.opacity = (bestTimes[1][1] <= goldTime)? '' : '0';
		bestTime2.children[2].textContent = secondsToTimeString(bestTimes[1][1] / 1000);
		bestTime3.children[0].textContent = '3. ' + bestTimes[2][0];
		(bestTime3.children[1] as HTMLImageElement).style.opacity = (bestTimes[2][1] <= goldTime)? '' : '0';
		bestTime3.children[2].textContent = secondsToTimeString(bestTimes[2][1] / 1000);

		levelImage.src = getImagePath(missionObj);

		levelNumberElement.textContent = `${Util.uppercaseFirstLetter(missionInfo.type)} Level ${currentLevelIndex + 1}`;
	}

	if (currentLevelIndex >= currentLevelArray.length-1) {
		nextButton.src = './assets/ui/play/next_i.png';
		nextButton.style.pointerEvents = 'none';
	} else {
		nextButton.src = './assets/ui/play/next_n.png';
		nextButton.style.pointerEvents = '';
	}

	if (currentLevelIndex <= 0) {
		prevButton.src = './assets/ui/play/prev_i.png';
		prevButton.style.pointerEvents = 'none';
	} else {
		prevButton.src = './assets/ui/play/prev_n.png';
		prevButton.style.pointerEvents = '';
	}

	for (let i = currentLevelIndex - 5; i <= currentLevelIndex + 5; i++) {
		let mission = currentLevelArray[i];
		if (!mission) continue;

		let imagePath = getImagePath(mission);
		if (ResourceManager.getImageFromCache(imagePath)) continue;

		ResourceManager.loadImage(imagePath);
	}
};

const getImagePath = (missionObj: Mission) => {
	let withoutExtension = "missions/" + missionObj.path.slice(0, -4);
	let imagePaths = ResourceManager.getFullNameOf(withoutExtension);
	let imagePath: string;
	for (let path of imagePaths) {
		if (!path.endsWith('.mis')) {
			imagePath = path;
			break;
		}
	}

	return "./assets/data/missions/" + missionObj.path.slice(0, missionObj.path.lastIndexOf('/') + 1) + imagePath;
};

export const cycleMission = (direction: number) => {
	currentLevelIndex += direction;
	if (currentLevelIndex < 0) currentLevelIndex = 0;
	if (currentLevelIndex >= currentLevelArray.length) currentLevelIndex = currentLevelArray.length - 1;

	displayMission();
};

window.addEventListener('keydown', (e) => {
	if (levelSelectDiv.classList.contains('hidden')) return;

	if (e.code === 'ArrowLeft') {
		cycleMission(-1);
		if (!prevButton.style.pointerEvents) prevButton.src = './assets/ui/play/prev_d.png';
	} else if (e.code === 'ArrowRight') {
		cycleMission(1);
		if (!nextButton.style.pointerEvents) nextButton.src = './assets/ui/play/next_d.png';
	} else if (e.code === 'Escape') {
		homeButton.src = './assets/ui/play/back_d.png';
	}
});

window.addEventListener('keyup', (e) => {
	if (levelSelectDiv.classList.contains('hidden')) return;

	if (e.code === 'ArrowLeft') {
		if (!prevButton.style.pointerEvents) prevButton.src = './assets/ui/play/prev_n.png';
	} else if (e.code === 'ArrowRight') {
		if (!nextButton.style.pointerEvents) nextButton.src = './assets/ui/play/next_n.png';
	} else if (e.code === 'Escape') {
		homeButton.click();
	}
});

hiddenUnlocker.addEventListener('mousedown', () => {
	let index = [beginnerLevels, intermediateLevels, advancedLevels].indexOf(currentLevelArray);
	let unlockedLevels = StorageManager.data.unlockedLevels[index];
	if (currentLevelIndex === unlockedLevels) {
		StorageManager.data.unlockedLevels[index]++;
		StorageManager.store();
		displayMission();
		AudioManager.play('buttonpress.wav');
	}
});