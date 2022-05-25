/*import { Interior } from "./interior";
import { Marble } from "./marble";
import { Shape, SharedShapeData } from "./shape";
import { MissionElementSimGroup, MissionElementType, MissionElementStaticShape, MissionElementItem, MisParser, MissionElementTrigger, MissionElementInteriorInstance, MissionElementTSStatic, MissionElementParticleEmitterNode, MissionElementSky } from "../../shared/mis_parser";
import { StartPad } from "./shapes/start_pad";
import { SignFinish } from "./shapes/sign_finish";
import { SignPlain } from "./shapes/sign_plain";
import { EndPad, fireworkSmoke, redSpark, redTrail, blueSpark, blueTrail } from "./shapes/end_pad";
import { Gem } from "./shapes/gem";
import { SuperJump, superJumpParticleOptions } from "./shapes/super_jump";
import { SignCaution } from "./shapes/sign_caution";
import { SuperBounce } from "./shapes/super_bounce";
import { RoundBumper } from "./shapes/round_bumper";
import { Helicopter } from "./shapes/helicopter";
import { DuctFan } from "./shapes/duct_fan";
import { AntiGravity } from "./shapes/anti_gravity";
import { LandMine, landMineSmokeParticle, landMineSparksParticle } from "./shapes/land_mine";
import { ShockAbsorber } from "./shapes/shock_absorber";
import { SuperSpeed, superSpeedParticleOptions } from "./shapes/super_speed";
import { TimeTravel } from "./shapes/time_travel";
import { Tornado } from "./shapes/tornado";
import { TrapDoor } from "./shapes/trap_door";
import { TriangleBumper } from "./shapes/triangle_bumper";
import { Oilslick } from "./shapes/oilslick";
import { Util, Scheduler } from "./util";
import { PowerUp } from "./shapes/power_up";
import { isPressed, releaseAllButtons, gamepadAxes, getPressedFlag, resetPressedFlag, hideTouchControls, maybeShowTouchControls, setTouchControlMode } from "./input";
import { SmallDuctFan } from "./shapes/small_duct_fan";
import { PathedInterior } from "./pathed_interior";
import { Trigger } from "./triggers/trigger";
import { InBoundsTrigger } from "./triggers/in_bounds_trigger";
import { HelpTrigger } from "./triggers/help_trigger";
import { OutOfBoundsTrigger } from "./triggers/out_of_bounds_trigger";
import { ResourceManager } from "./resources";
import { AudioManager, AudioSource } from "./audio";
import { ParticleManager, ParticleEmitterOptions, particleNodeEmittersEmitterOptions, ParticleEmitter } from "./particles";
import { StorageManager } from "./storage";
import { Replay } from "./replay";
import { Mission } from "./mission";
import { PushButton } from "./shapes/push_button";
import { DifFile } from "./parsing/dif_parser";
import { G } from "./global";
import { Sign } from "./shapes/sign";
import { Magnet } from "./shapes/magnet";
import { Nuke, nukeSmokeParticle, nukeSparksParticle } from "./shapes/nuke";
import { TeleportTrigger } from "./triggers/teleport_trigger";
import { DestinationTrigger } from "./triggers/destination_trigger";
import { Checkpoint } from "./shapes/checkpoint";
import { CheckpointTrigger } from "./triggers/checkpoint_trigger";
import { EasterEgg } from "./shapes/easter_egg";
import { RandomPowerUp } from "./shapes/random_power_up";
import { MbpPauseScreen } from "./ui/pause_screen_mbp";
import { MbpHud } from "./ui/hud_mbp";
import { Sky } from "./shapes/sky";
import { Glass } from "./shapes/glass";
import { Blast } from "./shapes/blast";
import { MegaMarble } from "./shapes/mega_marble";
import { Scene } from "./rendering/scene";
import { CubeTexture } from "./rendering/cube_texture";
import { Material } from "./rendering/material";
import { Mesh } from "./rendering/mesh";
import { Geometry } from "./rendering/geometry";
import { AmbientLight } from "./rendering/ambient_light";
import { DirectionalLight } from "./rendering/directional_light";
import { mainCanvas, mainRenderer, resize, SCALING_RATIO } from "./ui/misc";
import { FRAME_RATE_OPTIONS } from "./ui/options_mbp";
import { World } from "./physics/world";
import { CollisionShape } from "./physics/collision_shape";
import { Vector3 } from "./math/vector3";
import { Quaternion } from "./math/quaternion";
import { Euler } from "./math/euler";
import { OrthographicCamera, PerspectiveCamera } from "./rendering/camera";
import { Plane } from "./math/plane";
import { gameServers } from "./net/game_server";
import { GameServerCommands, GameServerMessage } from "../../shared/rtc";*/

/** How often the physics will be updated, per second. */
export const PHYSICS_TICK_RATE = 120;
const PLAYBACK_SPEED = 1; // Major attack surface for cheaters here 😟

/** The vertical offsets of overlay shapes to get them all visually centered. */
const SHAPE_OVERLAY_OFFSETS = {
	"shapes/images/helicopter.dts": -67,
	"shapes/items/superjump.dts": -70,
	"shapes/items/superbounce.dts": -55,
	"shapes/items/superspeed.dts": -53,
	"shapes/items/shockabsorber.dts": -53,
	"shapes/items/megamarble.dts": -70,
};
const SHAPE_OVERLAY_SCALES = {
	"shapes/items/megamarble.dts": 60,
};
/** The time in milliseconds when the marble is released from the start pad. */
export const GO_TIMdE = 3500;
/** Default camera pitch */
export const DEFAULT_PITCH = 0.45;
const BLAST_CHARGE_TIME = 25000;
const MAX_TIME = 999 * 60 * 1000 + 59 * 1000 + 999; // 999:59.99, should be large enough
const MBP_SONGS = ['astrolabe.ogg', 'endurance.ogg', 'flanked.ogg', 'grudge.ogg', 'mbp old shell.ogg', 'quiet lab.ogg', 'rising temper.ogg', 'seaside revisited.ogg', 'the race.ogg'];

// Used for frame rate limiting working correctly
const decoyCanvas = document.querySelector('#decoy-canvas') as HTMLCanvasElement;
const decoyCtx = decoyCanvas.getContext('2d');

export interface TimeState {
	/** The time since the level was loaded, this ticks up continuously. */
	timeSinceLoad: number,
	/** The time of the current attempt, this also ticks up continuously but is reset to 0 on restart. */
	currentAttemptTime: number,
	/** The gameplay time, affected by time travels and what not. */
	gameplayClock: number,
	/** A value in [0, 1], representing how far in between two physics ticks we are. */
	physicsTickCompletion: number,
	/** Which tick the simulation is currently on. */
	tickIndex: number
}

interface LoadingState {
	/** How many things have loaded */
	loaded: number,
	/** How many things are going to be loaded */
	total: number
}

/** The central control unit of gameplay. Handles loading, simulation and rendering. */
export class Level {
	mission: Mission;
	loadingState: LoadingState;

	scene: Scene;
	camera: PerspectiveCamera;
	envMap: CubeTexture;
	world: World;
	particles: ParticleManager;
	marble: Marble;
	marbles: Marble[] = [];
	marblePool: Marble[] = [];
	interiors: Interior[] = [];
	sharedInteriorData = new Map<DifFile["detailLevels"][number], any>();
	triggers: Trigger[] = [];

	shapes: Shape[] = [];
	/** Holds data shared between multiple shapes with the same constructor and .dts path. */
	sharedShapeData = new Map<string, Promise<SharedShapeData>>();
	/** The shapes used for drawing HUD overlay (powerups in the corner) */
	overlayShapes: Shape[] = [];
	overlayScene: Scene;
	overlayCamera: OrthographicCamera;
	/** The last end pad element in the mission file. */
	endPadElement: MissionElementStaticShape;

	/** Holds the setInterval id */
	tickInterval: number;
	timeState: TimeState;
	/** The last performance.now() time the physics were ticked. */
	lastPhysicsTick: number = null;
	lastFrameTime: number = null;
	started = false;
	paused = true;
	/** If the level is stopped, it shouldn't be used anymore. */
	stopped = false;
	/** The timestate at the moment of finishing. */
	finishTime: TimeState = null;
	finishYaw: number;
	finishPitch: number;
	/** The maximum time that has been displayed in the current attempt. */
	maxDisplayedTime = 0;

	pitch = 0;
	yaw = 0;
	/** Where the camera was when the marble went OOB. */
	oobCameraPosition: Vector3;
	lastVerticalTranslation = new Vector3();
	currentUp = new Vector3(0, 0, 1);
	/** The last time the orientation was changed (by a gravity modifier) */
	orientationChangeTime = -Infinity;
	/** The old camera orientation quat */
	oldOrientationQuat = new Quaternion();
	/** The new target camera orientation quat  */
	newOrientationQuat = new Quaternion();
	/** See usage. */
	previousMouseMovementDistance = 0;

	defaultGravity = 20;
	currentTimeTravelBonus = 0;
	heldPowerUp: PowerUp = null;
	totalGems = 0;
	gemCount = 0;
	blastAmount = 0;
	outOfBounds = false;
	outOfBoundsTime: TimeState;
	/** When the jump button was pressed, remember that it was pressed until the next tick to execute the jump. */
	jumpQueued = false;
	useQueued = false;
	blastQueued = false;
	/** Whether or not the player is currently pressing the restart button. */
	pressingRestart = false;
	restartPressTime: number = null;
	/** The time state at the last point the help text was updated. */
	helpTextTimeState: TimeState = null;
	/** The time state at the last point the alert text was updated. */
	alertTextTimeState: TimeState = null;

	/** Stores the shape that is the destination of the current checkpoint. */
	currentCheckpoint: Shape = null;
	/** If the checkpoint was triggered by a trigger, this field stores that trigger. */
	currentCheckpointTrigger: CheckpointTrigger = null;
	checkpointCollectedGems = new Set<Gem>();
	checkpointHeldPowerUp: PowerUp = null;
	/** Up vector at the point of checkpointing */
	checkpointUp: Vector3 = null;
	checkpointBlast: number = null;

	timeTravelSound: AudioSource;
	/** The alarm that plays in MBP when the player is about to pass the "par time". */
	alarmSound: AudioSource;
	music: AudioSource;
	/** Used for jukebox stuff */
	originalMusicName: string;
	replay: Replay;

	constructor(mission: Mission) {
		//super();
		this.mission = mission;
		this.loadingState = { loaded: 0, total: 0 };
	}

	/** Loads all necessary resources and builds the mission. */
	async init() {
		// Scan the mission for elements to determine required loading effort
		for (let element of this.mission.allElements) {
			if ([MissionElementType.InteriorInstance, MissionElementType.Item, MissionElementType.PathedInterior, MissionElementType.StaticShape, MissionElementType.TSStatic].includes(element._type)) {
				this.loadingState.total++;

				// Override the end pad element. We do this because only the last finish pad element will actually do anything.
				if (element._type === MissionElementType.StaticShape && element.datablock?.toLowerCase() === 'endpad') this.endPadElement = element;
			}
		}
		this.loadingState.total += 6 + 1 + 3 + 6 + 1; // For the scene, marble, UI, sounds (includes music!), and scene compile

		this.timeState = {
			timeSinceLoad: -1000 / PHYSICS_TICK_RATE, // Will become 0 with first tick
			currentAttemptTime: 0,
			gameplayClock: 0,
			physicsTickCompletion: 0,
			tickIndex: 0
		};

		// Apply overridden gravity
		if (this.mission.misFile.marbleAttributes["gravity"] !== undefined) {
			this.defaultGravity = MisParser.parseNumber(this.mission.misFile.marbleAttributes["gravity"]);
		}

		this.world = new World();
		await this.initScene();
		await this.initMarble(); this.loadingState.loaded += 1;
		this.particles = new ParticleManager(this);
		await this.particles.init(mainRenderer);
		this.scene.particleManager = this.particles;
		let soundPromise = this.initSounds();
		await this.addSimGroup(this.mission.root);
		await this.initUi(); this.loadingState.loaded += 3;
		await soundPromise; this.loadingState.loaded += 6;
		this.scene.compile(); this.loadingState.loaded += 1;

		this.replay = new Replay(this);
	}

	async start() {
		if (this.stopped) return;

		this.started = true;
		this.paused = false;
		this.restart(true);
		for (let interior of this.interiors) await interior.onLevelStart();
		for (let shape of this.shapes) await shape.onLevelStart();
		AudioManager.normalizePositionalAudioVolume();

		resize(false); // To update renderer
		mainCanvas.classList.remove('hidden');
		this.updateCamera(this.timeState); // Ensure that the camera is positioned correctly before the first tick for correct positional audio playback
		this.render(); // This will also do a tick
		this.lastPhysicsTick = performance.now(); // First render usually takes quite long (shader compile etc), so reset the last physics tick back to now
		this.tickInterval = setInterval(this.tick.bind(this));
		this.music.play();

		// Render them once
		for (let shape of this.shapes) if (shape.isTSStatic) shape.render(this.timeState);

		gameServers[0].connection.queueCommand('playMission', {
			missionPath: this.mission.path
		});
	}

	async initScene() {
		this.scene = new Scene(mainRenderer);

		let addedShadow = false;
		// There could be multiple suns, so do it for all of them
		for (let element of this.mission.allElements) {
			if (element._type !== MissionElementType.Sun) continue;

			let directionalColor = MisParser.parseVector4(element.color);
			let ambientColor = MisParser.parseVector4(element.ambient);
			let sunDirection = MisParser.parseVector3(element.direction);

			// Create the ambient light
			this.scene.addAmbientLight(new AmbientLight(new Vector3(ambientColor.x, ambientColor.y, ambientColor.z)));

			// Create the sunlight
			let directionalLight = new DirectionalLight(
				mainRenderer,
				new Vector3(directionalColor.x, directionalColor.y, directionalColor.z),
				sunDirection.clone()
			);
			this.scene.addDirectionalLight(directionalLight);

			if (!addedShadow) {
				addedShadow = true;

				let shadowCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 10);
				directionalLight.enableShadowCasting(256, shadowCamera);
			}
		}

		let skyElement = this.mission.allElements.find((element) => element._type === MissionElementType.Sky) as MissionElementSky;

		let fogColor = MisParser.parseVector4(skyElement.fogcolor);
		// Uber strange way Torque maps these values:
		if (fogColor.x > 1) fogColor.x = 1 - (fogColor.x - 1) % 256 / 256;
		if (fogColor.y > 1) fogColor.y = 1 - (fogColor.y - 1) % 256 / 256;
		if (fogColor.z > 1) fogColor.z = 1 - (fogColor.z - 1) % 256 / 256;

		let skySolidColor = MisParser.parseVector4(skyElement.skysolidcolor);
		// This is kind of a weird situation here. It seems as if when the skysolidcolor isn't the default value, it's used as the skycolor; otherwise, fog color is used. Strange.
		if (skySolidColor.x !== 0.6 || skySolidColor.y !== 0.6 || skySolidColor.z !== 0.6) fogColor = skySolidColor;

		mainRenderer.setClearColor(fogColor.x, fogColor.y, fogColor.z, 1);

		this.camera = new PerspectiveCamera(
			StorageManager.data.settings.fov,
			window.innerWidth / window.innerHeight,
			0.01,
			MisParser.parseNumber(skyElement.visibledistance)
		);

		if (skyElement.useskytextures === "1") {
			// Create the skybox
			let skyboxCubeTexture = await this.createSkyboxCubeTexture(skyElement.materiallist.slice(skyElement.materiallist.indexOf('data/') + 'data/'.length), true);
			if (skyboxCubeTexture) {
				let material = new Material();
				material.isSky = true;
				material.envMap = skyboxCubeTexture;
				material.depthWrite = false;
				material.renderOrder = -1000; // Render before everything else

				let geometry = new Geometry();
				geometry.positions.push(-1, -1, 0);
				geometry.positions.push(3, -1, 0);
				geometry.positions.push(-1, 3, 0);
				geometry.materials.push(0, 0, 0);
				geometry.indices.push(0, 1, 2);
				geometry.fillRest();

				let mesh = new Mesh(geometry, [material]);
				this.scene.add(mesh);
			}
		}

		let envmapCubeTexture = await this.createSkyboxCubeTexture('skies/sky_day.dml', false, 128); // Always the default MBG skybox
		// Use the skybox as the environment map. Don't use the actual envmap image file because its projection requires like three PhDs in mathematics.
		this.envMap = envmapCubeTexture;
	}

	async createSkyboxCubeTexture(dmlPath: string, increaseLoading: boolean, downsampleTo?: number) {
		let dmlDirectoryPath = dmlPath.slice(0, dmlPath.lastIndexOf('/'));
		let dmlFile = await this.mission.getResource(dmlPath);
		if (dmlFile) {
			// Get all skybox images
			let lines = (await ResourceManager.readBlobAsText(dmlFile)).split('\n').map(x => x.trim().toLowerCase());
			let skyboxImages: HTMLImageElement[] = [];

			for (let i = 0; i < 6; i++) {
				let line = lines[i];
				let filename = this.mission.getFullNamesOf(dmlDirectoryPath + '/' + line)[0];

				if (!filename) {
					skyboxImages.push(new Image());
				} else {
					let image = await this.mission.getImage(dmlDirectoryPath + '/' + filename);
					skyboxImages.push(image);
				}

				if (increaseLoading) this.loadingState.loaded++;
			}

			// Reorder them to the proper order
			skyboxImages = Util.remapIndices(skyboxImages, [1, 3, 4, 5, 0, 2]);
			if (downsampleTo) skyboxImages = await Promise.all(skyboxImages.map(x => Util.downsampleImage(x, downsampleTo, downsampleTo)));

			let skyboxTexture = new CubeTexture(mainRenderer, skyboxImages);
			return skyboxTexture;
		} else {
			if (increaseLoading) this.loadingState.loaded += 6;
			return null;
		}
	}

	async initMarble() {
		this.marble = new Marble(this);
		this.marble.playerControlled = true;
		await this.marble.init();

		this.scene.add(this.marble.group);
		this.world.add(this.marble.body);
		this.marbles.push(this.marble);

		for (let i = 0; i < 8; i++) {
			let marble = new Marble(this);
			await marble.init();

			this.scene.add(marble.group);
			marble.group.setOpacity(0);

			this.marblePool.push(marble);
		}

		/*
		for (let i = 0; i < 100; i++) {
			let second = new Marble(this);
			await second.init();

			this.scene.add(second.group);
			this.world.add(second.body);
			this.marbles.push(second);

			second.body.position.set(Math.random() * 5 - 2, Math.random() * 5 - 2 + 20, 510 + Math.random() * 20);
			second.body.linearVelocity.randomDirection();
			second.body.syncShapes();
			second.group.position.copy(this.marble.body.position);
			second.group.recomputeTransform();
			second.reset();
		}
		*/
	}

	async initUi() {
		// Load all necessary UI image elements
		await G.menu.hud.load();

		// Set up the HUD overlay

		let hudOverlayShapePaths = new Set<string>();
		for (let shape of this.shapes) {
			if (shape instanceof PowerUp || shape instanceof Gem) {
				if (shape instanceof PowerUp && shape.autoUse) continue; // Can't collect these aye

				// We need to display the gem and powerup shapes in the HUD
				if (shape instanceof RandomPowerUp) {
					for (let path of shape.getAllDtsPaths()) hudOverlayShapePaths.add(path);
				} else {
					hudOverlayShapePaths.add(shape.dtsPath);
				}
			}
		}

		this.overlayScene = new Scene(mainRenderer);
		let overlayLight = new AmbientLight(new Vector3().setScalar(1));
		this.overlayScene.addAmbientLight(overlayLight);

		this.overlayCamera = new OrthographicCamera(
			-window.innerWidth/2,
			window.innerWidth/2,
			-window.innerHeight/2,
			window.innerHeight/2,
			1,
			1000
		);
		this.overlayCamera.up.set(0, 0, -1);
		this.overlayCamera.lookAt(new Vector3(1, 0, 0));

		for (let path of hudOverlayShapePaths) {
			let shape = new Shape();
			shape.dtsPath = path;
			shape.ambientRotate = true;
			shape.showSequences = false;
			// MBP's UI gem color is randomized
			if (path.includes("gem") && G.menu.hud instanceof MbpHud) shape.matNamesOverride['base.gem'] = Gem.pickRandomColor() + '.gem';

			await shape.init();

			this.overlayShapes.push(shape);
			this.overlayScene.add(shape.group);

			if (path.includes("gem")) {
				shape.ambientSpinFactor /= -2; // Gems spin the other way apparently
			} else {
				shape.ambientSpinFactor /= 2;
				shape.setOpacity(0);
			}
		}

		if (this.totalGems > 0) {
			// Show the gem overlay
			G.menu.hud.setGemVisibility(true);
		} else {
			// Hide the gem UI
			G.menu.hud.setGemVisibility(false);
		}

		this.overlayScene.compile();

		if (G.menu.pauseScreen instanceof MbpPauseScreen)
			G.menu.pauseScreen.jukebox.reset();
	}

	async initSounds() {
		let musicFileName: string;
		if (this.mission.modification === 'ultra') {
			musicFileName = 'tim trance.ogg'; // ALWAYS play this banger
			this.originalMusicName = musicFileName;
		} else if (G.modification !== 'gold' && this.mission.missionInfo.music && this.mission.missionInfo.music.toLowerCase() !== 'pianoforte.ogg') {
			musicFileName = this.mission.missionInfo.music.toLowerCase();
			this.originalMusicName = musicFileName;
		} else {
			if (this.mission.modification === 'gold') {
				// Play the song based on the level index
				let levelIndex = G.menu.levelSelect.currentMissionArray.indexOf(this.mission);
				musicFileName = ['groovepolice.ogg', 'classic vibe.ogg', 'beach party.ogg'][(levelIndex + 1) % 3]; // The default music choice is based off of level index
				// Yes, the extra space is intentional
				this.originalMusicName = ['groove police.ogg', 'classic vibe.ogg', 'beach party.ogg'][(levelIndex + 1) % 3];
			} else {
				// Play a random *MBP* song
				musicFileName = Util.randomFromArray(MBP_SONGS);
				this.originalMusicName = musicFileName;
			}
		}
		if (G.modification === 'platinum') musicFileName = 'music/' + musicFileName;

		let toLoad = ["spawn.wav", "ready.wav", "set.wav", "go.wav", "whoosh.wav", musicFileName];
		if (isFinite(this.mission.qualifyTime) && G.modification === 'platinum') toLoad.push("alarm.wav", "alarm_timeout.wav", "infotutorial.wav");

		try {
			await AudioManager.loadBuffers(toLoad);
		} catch (e) {
			// Something died, maybe it was the music, try replacing it with a song we know exists
			let newMusic = Util.randomFromArray(MBP_SONGS);
			this.originalMusicName = newMusic;
			toLoad[toLoad.indexOf(musicFileName)] = 'music/' + newMusic;
			musicFileName = 'music/' + newMusic;
			await AudioManager.loadBuffers(toLoad);
		}

		this.music = AudioManager.createAudioSource(musicFileName, AudioManager.musicGain);
		this.music.setLoop(true);
		await this.music.promise;
	}

	/** Adds all elements within a sim group. */
	async addSimGroup(simGroup: MissionElementSimGroup) {
		// Check if it's a pathed interior group
		if (simGroup.elements.find((element) => element._type === MissionElementType.PathedInterior)) {
			// Create the pathed interior
			let pathedInterior = await PathedInterior.createFromSimGroup(simGroup, this);
			if (!pathedInterior) return;

			this.scene.add(pathedInterior.mesh);
			if (pathedInterior.hasCollision) this.world.add(pathedInterior.body);

			for (let trigger of pathedInterior.triggers) {
				this.world.add(trigger.body);
				this.triggers.push(trigger);
			}

			return;
		}

		let promises: Promise<any>[] = [];

		for (let element of simGroup.elements) {
			switch (element._type) {
				case MissionElementType.SimGroup:
					promises.push(this.addSimGroup(element));
					break;
				case MissionElementType.InteriorInstance:
					promises.push(this.addInterior(element));
					break;
				case MissionElementType.StaticShape: case MissionElementType.Item:
					promises.push(this.addShape(element));
					break;
				case MissionElementType.Trigger:
					promises.push(this.addTrigger(element));
					break;
				case MissionElementType.TSStatic:
					promises.push(this.addTSStatic(element));
					break;
				case MissionElementType.ParticleEmitterNode:
					this.addParticleEmitterNode(element);
					break;
			}
		}

		await Promise.all(promises);
	}

	async addInterior(element: MissionElementInteriorInstance) {
		let { dif: difFile, path } = await this.mission.getDif(element.interiorfile);
		if (!difFile) return;

		let interior = new Interior(difFile, path, this);
		this.interiors.push(interior);

		await Util.wait(10); // See shapes for the meaning of this hack
		await interior.init(element._id);

		this.scene.add(interior.mesh);

		let interiorPosition = MisParser.parseVector3(element.position);
		let interiorRotation = MisParser.parseRotation(element.rotation);
		let interiorScale = MisParser.parseVector3(element.scale);
		let hasCollision = interiorScale.x !== 0 && interiorScale.y !== 0 && interiorScale.z !== 0; // Don't want to add buggy geometry

		// Fix zero-volume interiors so they receive correct lighting
		if (interiorScale.x === 0) interiorScale.x = 0.0001;
		if (interiorScale.y === 0) interiorScale.y = 0.0001;
		if (interiorScale.z === 0) interiorScale.z = 0.0001;

		interior.setTransform(interiorPosition, interiorRotation, interiorScale);

		if (hasCollision) this.world.add(interior.body);
	}

	async addShape(element: MissionElementStaticShape | MissionElementItem) {
		let shape: Shape;

		// Add the correct shape based on type
		let dataBlockLowerCase = element.datablock?.toLowerCase();
		if (!dataBlockLowerCase) { /* Make sure we don't do anything if there's no data block */ }
		else if (dataBlockLowerCase === "startpad") shape = new StartPad();
		else if (dataBlockLowerCase === "endpad") shape = new EndPad(element === this.endPadElement);
		else if (dataBlockLowerCase === "signfinish") shape = new SignFinish();
		else if (dataBlockLowerCase.startsWith("signplain")) shape = new SignPlain(element as MissionElementStaticShape);
		else if (dataBlockLowerCase.startsWith("gemitem")) shape = new Gem(element as MissionElementItem), this.totalGems++;
		else if (dataBlockLowerCase === "superjumpitem") shape = new SuperJump(element as MissionElementItem);
		else if (dataBlockLowerCase.startsWith("signcaution")) shape = new SignCaution(element as MissionElementStaticShape);
		else if (dataBlockLowerCase === "superbounceitem") shape = new SuperBounce(element as MissionElementItem);
		else if (dataBlockLowerCase === "roundbumper") shape = new RoundBumper();
		else if (dataBlockLowerCase === "trianglebumper") shape = new TriangleBumper();
		else if (dataBlockLowerCase === "helicopteritem") shape = new Helicopter(element as MissionElementItem);
		else if (dataBlockLowerCase === "ductfan") shape = new DuctFan();
		else if (dataBlockLowerCase === "smallductfan") shape = new SmallDuctFan();
		else if (dataBlockLowerCase === "antigravityitem") shape = new AntiGravity(element as MissionElementItem);
		else if (dataBlockLowerCase === "norespawnantigravityitem") shape = new AntiGravity(element as MissionElementItem, true);
		else if (dataBlockLowerCase === "landmine") shape = new LandMine();
		else if (dataBlockLowerCase === "shockabsorberitem") shape = new ShockAbsorber(element as MissionElementItem);
		else if (dataBlockLowerCase === "superspeeditem") shape = new SuperSpeed(element as MissionElementItem);
		else if (["timetravelitem", "timepenaltyitem"].includes(dataBlockLowerCase)) shape = new TimeTravel(element as MissionElementItem);
		else if (dataBlockLowerCase === "tornado") shape = new Tornado();
		else if (dataBlockLowerCase === "trapdoor") shape = new TrapDoor(element as MissionElementStaticShape);
		else if (dataBlockLowerCase === "oilslick") shape = new Oilslick();
		else if (dataBlockLowerCase === "pushbutton") shape = new PushButton();
		else if (dataBlockLowerCase.startsWith("sign") || dataBlockLowerCase === "arrow") shape = new Sign(element as MissionElementStaticShape);
		else if (dataBlockLowerCase === "magnet") shape = new Magnet();
		else if (dataBlockLowerCase === "nuke") shape = new Nuke();
		else if (dataBlockLowerCase === "checkpoint") shape = new Checkpoint();
		else if (dataBlockLowerCase === "easteregg") shape = new EasterEgg(element as MissionElementItem);
		else if (dataBlockLowerCase === "randompowerupitem") shape = new RandomPowerUp(element as MissionElementItem);
		else if (["clear", "cloudy", "dusk", "wintry"].includes(dataBlockLowerCase)) shape = new Sky(dataBlockLowerCase);
		else if (/glass_\d+shape/.test(dataBlockLowerCase)) shape = new Glass(dataBlockLowerCase);
		else if (dataBlockLowerCase === "blastitem") shape = new Blast(element as MissionElementItem);
		else if (dataBlockLowerCase === "megamarbleitem") shape = new MegaMarble(element as MissionElementItem);

		if (!shape) return;

		this.shapes.push(shape);
		// This is a bit hacky, but wait a short amount so that all shapes will have been created by the time this codepath continues. This is necessary for correct sharing of data between shapes.
		await Util.wait(10);
		await shape.init(this, element);

		// Set the shape's transform
		let shapePosition = MisParser.parseVector3(element.position);
		let shapeRotation = MisParser.parseRotation(element.rotation);
		let shapeScale = MisParser.parseVector3(element.scale);

		// Apparently we still do collide with zero-volume shapes
		if (shapeScale.x === 0) shapeScale.x = 0.0001;
		if (shapeScale.y === 0) shapeScale.y = 0.0001;
		if (shapeScale.z === 0) shapeScale.z = 0.0001;

		shape.setTransform(shapePosition, shapeRotation, shapeScale);

		this.scene.add(shape.group);

		for (let body of shape.bodies) this.world.add(body);
		for (let collider of shape.colliders) this.world.add(collider.body);
	}

	async addTrigger(element: MissionElementTrigger) {
		let trigger: Trigger;

		// Create a trigger based on type
		let dataBlockLowerCase = element.datablock?.toLowerCase();
		if (dataBlockLowerCase === "outofboundstrigger") {
			trigger = new OutOfBoundsTrigger(element, this);
		} else if (dataBlockLowerCase === "inboundstrigger") {
			trigger = new InBoundsTrigger(element, this);
		} else if (dataBlockLowerCase === "helptrigger") {
			trigger = new HelpTrigger(element, this);
		} else if (dataBlockLowerCase === "teleporttrigger") {
			trigger = new TeleportTrigger(element, this);
		} else if (dataBlockLowerCase === "destinationtrigger") {
			trigger = new DestinationTrigger(element, this);
		} else if (dataBlockLowerCase === "checkpointtrigger") {
			trigger = new CheckpointTrigger(element, this);
		}

		if (!trigger) return;

		this.triggers.push(trigger);
		this.world.add(trigger.body);

		await trigger.init();
	}

	/** Adds a TSStatic (totally static shape) to the world. */
	async addTSStatic(element: MissionElementTSStatic) {
		let shape = new Shape();
		let shapeName = element.shapename.toLowerCase();
		let index = shapeName.indexOf('data/');
		if (index === -1) return;

		shape.dtsPath = shapeName.slice(index + 'data/'.length);
		shape.isTSStatic = true;
		shape.shareId = 1;
		if (shapeName.includes('colmesh')) shape.receiveShadows = false; // Special case for colmesh

		this.shapes.push(shape);
		await Util.wait(10); // Same hack as for regular shapes
		try {
			await shape.init(this, element);
		} catch (e) {
			console.error("Error in creating TSStatic, skipping it for now.", e);
			Util.removeFromArray(this.shapes, shape);
			return;
		}

		shape.setTransform(MisParser.parseVector3(element.position), MisParser.parseRotation(element.rotation), MisParser.parseVector3(element.scale));

		this.scene.add(shape.group);
		if (shape.worldScale.x !== 0 && shape.worldScale.y !== 0 && shape.worldScale.z !== 0) {
			// Only add the shape if it actually has any volume
			for (let body of shape.bodies) this.world.add(body);
			for (let collider of shape.colliders) this.world.add(collider.body);
		}
	}

	/** Adds a ParticleEmitterNode to the world. */
	addParticleEmitterNode(element: MissionElementParticleEmitterNode) {
		let emitterOptions = particleEmitterMap[element.emitter];
		if (!emitterOptions) return;

		this.particles.createEmitter(emitterOptions, MisParser.parseVector3(element.position));
	}

	/** Restarts and resets the level. */
	restart(forceHardRestart: boolean) {
		if (!forceHardRestart && this.currentCheckpoint && this.replay.mode !== 'playback') {
			// There's a checkpoint, so load its state instead of restarting the whole level
			this.loadCheckpointState();
			return;
		}

		let hud = G.menu.hud;
		hud.setPowerupButtonState(false, true);

		this.timeState.gameplayClock = 0;

		if (this.replay && this.replay.version <= 4) {
			// In older versions, the first tick would immediately advance the entire simulation to a non-zero time instead of correctly keeping it at 0 for a while.
			this.timeState.currentAttemptTime = 0;
			this.timeState.tickIndex = 0;
		} else {
			// Both of these will become zero after the first tick:
			this.timeState.currentAttemptTime = -1000 / PHYSICS_TICK_RATE;
			this.timeState.tickIndex = -1;
		}

		this.currentTimeTravelBonus = 0;
		this.outOfBounds = false;
		this.lastPhysicsTick = null;
		this.maxDisplayedTime = 0;
		this.blastAmount = 0;

		if (this.totalGems > 0) {
			this.gemCount = 0;
			hud.displayGemCount(this.gemCount, this.totalGems);
		}

		this.currentCheckpoint = null;
		this.currentCheckpointTrigger = null;
		this.checkpointCollectedGems.clear();
		this.checkpointHeldPowerUp = null;
		this.checkpointUp = null;
		this.checkpointBlast = null;
		this.restartPressTime = null;

		this.finishTime = null;

		let { position: startPosition, euler } = this.getStartPositionAndOrientation();

		// Place the marble a bit above the start pad position
		this.marble.body.position.set(startPosition.x, startPosition.y, startPosition.z + 3);
		this.marble.body.syncShapes();
		this.marble.group.position.copy(this.marble.body.position);
		this.marble.group.recomputeTransform();
		this.marble.reset();
		this.marble.calculatePredictiveTransforms();

		// Determine starting camera orientation based on the start pad
		this.yaw = euler.z + Math.PI/2;
		this.pitch = DEFAULT_PITCH;

		let missionInfo = this.mission.missionInfo;
		if (missionInfo.starthelptext) G.menu.hud.displayHelp(missionInfo.starthelptext); // Show the start help text

		for (let shape of this.shapes) shape.reset();
		for (let interior of this.interiors) interior.reset();
		for (let trigger of this.triggers) trigger.reset();

		// Reset the physics
		this.currentUp.set(0, 0, 1);
		this.orientationChangeTime = -Infinity;
		this.oldOrientationQuat = new Quaternion();
		this.newOrientationQuat = new Quaternion();
		this.setGravityIntensity(this.defaultGravity);

		this.deselectPowerUp();
		hud.setCenterText('none');
		maybeShowTouchControls();
		setTouchControlMode((this.replay.mode === 'playback')? 'replay' : 'normal');

		this.timeTravelSound?.stop();
		this.timeTravelSound = null;
		this.alarmSound?.stop();
		this.alarmSound = null;

		this.replay.init();

		// Queue the ready-set-go events

		AudioManager.play('spawn.wav');

		this.clearSchedule();
		this.schedule(500, () => {
			hud.setCenterText('ready');
			AudioManager.play('ready.wav');
		});
		this.schedule(2000, () => {
			hud.setCenterText('set');
			AudioManager.play('set.wav');
		});
		this.schedule(GO_TIME, () => {
			hud.setCenterText('go');
			AudioManager.play('go.wav');
		});
		this.schedule(5500, () => {
			if (!this.outOfBounds) hud.setCenterText('none');
		});
	}

	render() {
		if (this.stopped) return;
		requestAnimationFrame(this.render.bind(this));

		let time = performance.now();
		if (this.lastFrameTime === null) {
			this.lastFrameTime = time;
		} else {
			let cap = FRAME_RATE_OPTIONS[StorageManager.data.settings.frameRateCap];

			// When FPS is unlocked in the browser but limited in-game, for some browser frames, the game won't draw anything. This makes the browser think it's okay to slow down the rate of requestAnimationFrame, which is not desirable in this case. Therefore we trick the browser into thinking the GPU is doing something by continuously clearing a 1x1 canvas each frame.
			if (isFinite(cap)) decoyCtx.clearRect(0, 0, 1, 1);

			// Take care of frame rate limiting:
			let elapsed = time - this.lastFrameTime;
			let required = 1000 / cap;
			if (elapsed < required) return;

			this.lastFrameTime += required;
			this.lastFrameTime = Math.max(this.lastFrameTime, time - 2 * required); // To avoid the last frame time from lagging behind
		}

		this.tick(time);

		if (this.stopped) return; // Check it again here 'cuz the tick might've changed it

		let physicsTickLength = 1000 / PHYSICS_TICK_RATE;
		let completion = Util.clamp((time - this.lastPhysicsTick) / physicsTickLength * PLAYBACK_SPEED, 0, 1);
		// Set up an intermediate time state for smoother rendering
		let tempTimeState: TimeState = {
			timeSinceLoad: this.timeState.timeSinceLoad + completion * physicsTickLength,
			currentAttemptTime: this.timeState.currentAttemptTime + completion * physicsTickLength,
			gameplayClock: (this.currentTimeTravelBonus || this.timeState.currentAttemptTime < GO_TIME)? this.timeState.gameplayClock : this.timeState.gameplayClock + completion * physicsTickLength,
			physicsTickCompletion: completion,
			tickIndex: this.timeState.tickIndex + completion
		};

		for (let marble of this.marbles) marble.render(tempTimeState);
		for (let interior of this.interiors) interior.render(tempTimeState);
		for (let shape of this.shapes) if (!shape.isTSStatic) shape.render(tempTimeState);
		this.particles.render(tempTimeState.timeSinceLoad);

		this.updateCamera(tempTimeState);
		this.camera.updateMatrixWorld();

		// Update the shadow camera
		this.scene.directionalLights[0]?.updateCamera(this.marble.group.position.clone(), -1);

		// Render the scene
		this.scene.prepareForRender(this.camera);
		this.marble.renderReflection();
		mainRenderer.render(this.scene, this.camera);

		// Update the overlay
		for (let overlayShape of this.overlayShapes) {
			overlayShape.group.position.x = 500; // Make sure the shape is between the near and far planes of the camera
			overlayShape.render(this.timeState);

			if (overlayShape.dtsPath.includes("gem")) {
				overlayShape.group.scale.setScalar(45 / SCALING_RATIO);
				overlayShape.group.position.y = 25 / SCALING_RATIO;
				overlayShape.group.position.z = -35 / SCALING_RATIO;
			} else {
				overlayShape.group.scale.setScalar((SHAPE_OVERLAY_SCALES[overlayShape.dtsPath as keyof typeof SHAPE_OVERLAY_SCALES] ?? 40) / SCALING_RATIO);
				overlayShape.group.position.y = window.innerWidth - 55 / SCALING_RATIO;
				overlayShape.group.position.z = SHAPE_OVERLAY_OFFSETS[overlayShape.dtsPath as keyof typeof SHAPE_OVERLAY_OFFSETS] / SCALING_RATIO;
			}

			overlayShape.group.recomputeTransform();
		}

		// Render the overlay
		this.overlayCamera.updateMatrixWorld();
		this.overlayScene.prepareForRender(this.overlayCamera);
		mainRenderer.render(this.overlayScene, this.overlayCamera, null, false);

		// This might seem a bit strange, but the time we display is actually a few milliseconds in the PAST (unless the user is currently in TT or has finished), for the reason that time was able to go backwards upon finishing or collecting TTs due to CCD time correction. That felt wrong, so we accept this inaccuracy in displaying time for now.
		let timeToDisplay = tempTimeState.gameplayClock;
		if (this.finishTime) timeToDisplay = this.finishTime.gameplayClock;
		if (this.currentTimeTravelBonus === 0 && !this.finishTime) timeToDisplay = Math.max(timeToDisplay - 1000 / PHYSICS_TICK_RATE, 0);
		this.maxDisplayedTime = Math.max(timeToDisplay, this.maxDisplayedTime);
		if (this.currentTimeTravelBonus === 0 && !this.finishTime) timeToDisplay = this.maxDisplayedTime;

		timeToDisplay = Math.min(timeToDisplay, MAX_TIME);

		let hud = G.menu.hud;
		hud.displayTime(timeToDisplay / 1000, this.determineClockColor(timeToDisplay));
		hud.displayBlastMeterFullness(this.blastAmount);
		hud.displayFps();

		// Update help and alert text visibility
		let helpTextTime = this.helpTextTimeState?.timeSinceLoad ?? -Infinity;
		let alertTextTime = this.alertTextTimeState?.timeSinceLoad ?? -Infinity;
		let helpTextCompletion = Util.clamp((this.timeState.timeSinceLoad - helpTextTime - 3000) / 1000, 0, 1) ** 2;
		let alertTextCompletion = Util.clamp((this.timeState.timeSinceLoad - alertTextTime - 3000) / 1000, 0, 1) ** 2;

		hud.helpElement.style.opacity = (1 - helpTextCompletion).toString();
		hud.helpElement.style.filter = `brightness(${Util.lerp(1, 0.25, helpTextCompletion)})`;
		hud.alertElement.style.opacity = (1 - alertTextCompletion).toString();
		hud.alertElement.style.filter = `brightness(${Util.lerp(1, 0.25, alertTextCompletion)})`;
	}

	determineClockColor(timeToDisplay: number) {
		if (G.modification === 'gold') return;

		if (this.finishTime) return 'green'; // Even if not qualified
		if (this.timeState.currentAttemptTime < GO_TIME || this.currentTimeTravelBonus > 0) return 'green';
		if (timeToDisplay >= this.mission.qualifyTime) return 'red';

		if (this.timeState.currentAttemptTime >= GO_TIME && isFinite(this.mission.qualifyTime) && G.modification === 'platinum') {
			// Create the flashing effect
			let alarmStart = this.mission.computeAlarmStartTime();
			let elapsed = timeToDisplay - alarmStart;
			if (elapsed < 0) return;
			if (Math.floor(elapsed / 1000) % 2 === 0) return 'red';
		}

		return; // Default yellow
	}

	/** Updates the position of the camera based on marble position and orientation. */
	updateCamera(timeState: TimeState) {
		let marblePosition = this.marble.group.position;
		let orientationQuat = this.getOrientationQuat(timeState);
		let up = new Vector3(0, 0, 1).applyQuaternion(orientationQuat);
		let directionVector = new Vector3(1, 0, 0);
		// The camera is translated up a bit so it looks "over" the marble
		let cameraVerticalTranslation = new Vector3(0, 0, 0.3);

		if (this.replay.mode === 'playback') {
			let indexLow = Math.max(0, this.replay.currentTickIndex - 1);
			let indexHigh = this.replay.currentTickIndex;

			// Smoothly interpolate pitch and yaw between the last two keyframes
			this.pitch = Util.lerp(this.replay.cameraOrientations[indexLow].pitch, this.replay.cameraOrientations[indexHigh].pitch, timeState.physicsTickCompletion);
			this.pitch = Math.max(-Math.PI/2 + Math.PI/4, Math.min(Math.PI/2 - 0.0001, this.pitch)); // This bounds thing might have gotten inaccurate in the conversion from float64 to float32, so do it here again
			this.yaw = Util.lerp(this.replay.cameraOrientations[indexLow].yaw, this.replay.cameraOrientations[indexHigh].yaw, timeState.physicsTickCompletion);
		}

		if (this.finishTime) {
			// Make the camera spin around slowly
			this.pitch = Util.lerp(this.finishPitch, DEFAULT_PITCH, Util.clamp((timeState.currentAttemptTime - this.finishTime.currentAttemptTime) / 333, 0, 1));
			this.yaw = this.finishYaw - (timeState.currentAttemptTime - this.finishTime.currentAttemptTime) / 1000 * 0.6;
		}

		if (!this.outOfBounds) {
			directionVector.applyAxisAngle(new Vector3(0, 1, 0), this.pitch);
			directionVector.applyAxisAngle(new Vector3(0, 0, 1), this.yaw);
			directionVector.applyQuaternion(orientationQuat);

			cameraVerticalTranslation.applyAxisAngle(new Vector3(0, 1, 0), this.pitch);
			cameraVerticalTranslation.applyAxisAngle(new Vector3(0, 0, 1), this.yaw);
			cameraVerticalTranslation.applyQuaternion(orientationQuat);

			this.camera.up = up;
			this.camera.position.copy(marblePosition).sub(directionVector.clone().multiplyScalar(2.5));
			this.camera.lookAt(marblePosition);
			this.camera.position.add(cameraVerticalTranslation);

			// Handle wall intersections:

			const closeness = 0.1;
			let rayCastOrigin = marblePosition;

			let processedShapes = new Set<CollisionShape>();
			for (let i = 0; i < 3; i++) {
				// Shoot rays from the marble to the postiion of the camera
				let rayCastDirection = this.camera.position.clone().sub(rayCastOrigin);
				rayCastDirection.addScaledVector(rayCastDirection.clone().normalize(), 2);

				let length = rayCastDirection.length();
				let hits = this.world.castRay(rayCastOrigin, rayCastDirection.normalize(), length);
				let firstHit = hits.find(x => x.shape !== this.marble.shape);

				if (firstHit) {
					processedShapes.add(firstHit.shape);

					// Construct a plane at the point of ray impact based on the normal
					let plane = new Plane();
					let normal = firstHit.normal;
					let position = firstHit.point;
					plane.setFromNormalAndCoplanarPoint(normal, position);

					// Project the camera position onto the plane
					let target = new Vector3();
					let projected = plane.projectPoint(this.camera.position, target);

					// If the camera is too far from the plane anyway, break
					let dist = plane.distanceToPoint(this.camera.position);
					if (dist >= closeness) break;

					// Go the projected point and look at the marble
					this.camera.position.copy(projected.add(normal.multiplyScalar(closeness)));
					Util.cameraLookAtDirect(this.camera, marblePosition);

					let rotationAxis = new Vector3(1, 0, 0);
					rotationAxis.applyQuaternion(this.camera.orientation);

					let theta = Math.atan(0.3 / 2.5); // 0.3 is the vertical translation, 2.5 the distance away from the marble.

					// Rotate the camera back upwards such that the marble is in the same visual location on screen as before
					let rot = new Quaternion().setFromAxisAngle(rotationAxis, theta);
					this.camera.orientation.premultiply(rot);
					continue;
				}

				break;
			}

			this.lastVerticalTranslation = cameraVerticalTranslation;
		} else {
			// Simply look at the marble
			this.camera.position.copy(this.oobCameraPosition);
			this.camera.position.sub(this.lastVerticalTranslation);
			this.camera.lookAt(marblePosition);
			this.camera.position.add(this.lastVerticalTranslation);
		}
	}

	tick(time?: number) {
		if (this.stopped) return;
		//if (this.paused) return; // fixme

		if (time === undefined) time = performance.now();
		let playReplay = this.replay.mode === 'playback';

		if (!playReplay && !G.menu.finishScreen.showing && (isPressed('use') || this.useQueued) && getPressedFlag('use')) {
			if (this.outOfBounds && !this.finishTime) {
				// Skip the out of bounds "animation" and restart immediately
				this.restart(false);
				return;
			}
		}

		G.menu.finishScreen.handleGamepadInput();

		// Handle pressing of the gamepad pause button
		if (isPressed('pause') && getPressedFlag('pause')) {
			resetPressedFlag('pause');
			resetPressedFlag('jump');
			resetPressedFlag('use');
			resetPressedFlag('restart');
			this.pause();
		}

		if (this.lastPhysicsTick === null) {
			// If there hasn't been a physics tick yet, ensure there is one now
			this.lastPhysicsTick = time - 1000 / PHYSICS_TICK_RATE * 1.1 / PLAYBACK_SPEED;
		}

		/** Time since the last physics tick */
		let elapsed = time - this.lastPhysicsTick;
		elapsed *= PLAYBACK_SPEED;
		if (elapsed >= 1000) {
			elapsed = 1000;
			this.lastPhysicsTick = time - 1000;
		}

		let tickDone = false;
		// Make sure to execute the correct amount of ticks
		while (elapsed >= 1000 / PHYSICS_TICK_RATE) {
			// Update gameplay clock, taking into account the Time Travel state
			if (this.timeState.currentAttemptTime >= GO_TIME) {
				if (this.currentTimeTravelBonus > 0) {
					// Subtract remaining time travel time
					this.currentTimeTravelBonus -= 1000 / PHYSICS_TICK_RATE;

					if (!this.timeTravelSound) {
						this.timeTravelSound = AudioManager.createAudioSource('timetravelactive.wav');
						this.timeTravelSound.setLoop(true);
						this.timeTravelSound.play();
					}
				} else {
					// Increase the gameplay time
					this.timeState.gameplayClock += 1000 / PHYSICS_TICK_RATE;

					this.timeTravelSound?.stop();
					this.timeTravelSound = null;
				}

				if (this.currentTimeTravelBonus < 0) {
					// If we slightly undershot the zero mark of the remaining time travel bonus, add the "lost time" back onto the gameplay clock:
					this.timeState.gameplayClock += -this.currentTimeTravelBonus;
					this.currentTimeTravelBonus = 0;
				}
			}

			this.timeState.timeSinceLoad += 1000 / PHYSICS_TICK_RATE;
			this.timeState.currentAttemptTime += 1000 / PHYSICS_TICK_RATE;
			this.timeState.tickIndex++;
			this.lastPhysicsTick += 1000 / PHYSICS_TICK_RATE / PLAYBACK_SPEED;
			elapsed -= 1000 / PHYSICS_TICK_RATE;

			let prevGameplayClock = this.timeState.gameplayClock;

			this.tickSchedule(this.timeState.currentAttemptTime);

			if (this.mission.hasBlast && this.blastAmount < 1) this.blastAmount = Util.clamp(this.blastAmount + 1000 / BLAST_CHARGE_TIME / PHYSICS_TICK_RATE, 0, 1);

			for (let interior of this.interiors) interior.tick(this.timeState);
			for (let trigger of this.triggers) trigger.tick(this.timeState);
			for (let shape of this.shapes) if (!shape.isTSStatic) shape.tick(this.timeState);
			for (let marble of this.marbles) marble.update();

			if (!playReplay) {
				let gravityBefore = this.world.gravity.clone();
				if (this.finishTime) this.world.gravity.setScalar(0);
				this.world.step(1 / PHYSICS_TICK_RATE);
				this.world.gravity.copy(gravityBefore);
			}

			for (let marble of this.marbles) marble.postStep();

			this.jumpQueued = false;
			this.useQueued = false;
			this.blastQueued = false;

			let yawChange = 0.0;
			let pitchChange = 0.0;
			let freeLook = StorageManager.data.settings.alwaysFreeLook || isPressed('freeLook');
			let amount = Util.lerp(1, 6, StorageManager.data.settings.keyboardSensitivity);
			if (isPressed('cameraLeft')) yawChange += amount;
			if (isPressed('cameraRight')) yawChange -= amount;
			if (isPressed('cameraUp')) pitchChange -= amount;
			if (isPressed('cameraDown')) pitchChange += amount;

			yawChange -= gamepadAxes.cameraX * Util.lerp(0.5, 10, StorageManager.data.settings.mouseSensitivity);
			if (freeLook) pitchChange += gamepadAxes.cameraY * Util.lerp(0.5, 10, StorageManager.data.settings.mouseSensitivity);

			this.yaw += yawChange / PHYSICS_TICK_RATE;
			this.pitch += pitchChange / PHYSICS_TICK_RATE;

			this.particles.tick();
			tickDone = true;

			// Handle alarm warnings (that the user is about to exceed the par time)
			if (this.timeState.currentAttemptTime >= GO_TIME && isFinite(this.mission.qualifyTime) && G.modification === 'platinum' && !this.finishTime) {
				let alarmStart = this.mission.computeAlarmStartTime();

				if (prevGameplayClock <= alarmStart && this.timeState.gameplayClock >= alarmStart && !this.alarmSound) {
					// Start the alarm
					this.alarmSound = AudioManager.createAudioSource('alarm.wav');
					this.alarmSound.setLoop(true);
					this.alarmSound.play();
					G.menu.hud.displayHelp(`You have ${(this.mission.qualifyTime - alarmStart) / 1000} seconds remaining.`, true);
				}
				if (prevGameplayClock < this.mission.qualifyTime && this.timeState.gameplayClock >= this.mission.qualifyTime) {
					// Stop the alarm
					this.alarmSound?.stop();
					this.alarmSound = null;
					G.menu.hud.displayHelp("The clock has passed the Par Time.", true);
					AudioManager.play('alarm_timeout.wav');
				}
			}

			// Record or playback the replay
			if (!playReplay) {
				this.replay.record();
			} else {
				this.replay.playBack();
				if (this.replay.isPlaybackComplete()) {
					this.stopAndExit();
					return;
				}
			}

			this.queueStateUpdates();
		}

		AudioManager.updatePositionalAudio(this.timeState, this.camera.position, this.yaw);
		this.pitch = Math.max(-Math.PI/2 + Math.PI/4, Math.min(Math.PI/2 - 0.0001, this.pitch)); // The player can't look straight up
		if (tickDone) for (let marble of this.marbles) marble.calculatePredictiveTransforms();

		// Handle pressing of the restart button
		if (!this.finishTime && isPressed('restart') && !this.pressingRestart) {
			this.restart(false);
			if (this.currentCheckpoint) this.restartPressTime = performance.now();
			this.pressingRestart = true;
		} else if (!isPressed('restart')) {
			this.pressingRestart = false;
		}

		// Holding down the restart button for 1 second will force a hard restart
		if (!this.finishTime && isPressed('restart') && this.restartPressTime !== null) {
			if (this.restartPressTime !== null && performance.now() - this.restartPressTime >= 1000)
				this.restart(true);
		}
	}

	/** Get the current interpolated orientation quaternion. */
	getOrientationQuat(time: TimeState) {
		let completion = Util.clamp((time.currentAttemptTime - this.orientationChangeTime) / 300, 0, 1);
		return this.oldOrientationQuat.clone().slerp(this.newOrientationQuat, completion);
	}

	/** Sets the current up vector and gravity with it. */
	setUp(newUp: Vector3, instant = false) {
		let time = this.timeState;

		newUp.normalize(); // We never know 👀
		this.currentUp.copy(newUp);
		let gravityStrength = this.world.gravity.length();
		this.world.gravity.copy(newUp).multiplyScalar(-1 * gravityStrength);

		let currentQuat = this.getOrientationQuat(time);
		let oldUp = new Vector3(0, 0, 1);
		oldUp.applyQuaternion(currentQuat);

		let quatChange = new Quaternion();
		let dot = newUp.dot(oldUp);
		if (dot <= -(1 - 1e-15) && !(this.replay.version < 3)) { // If the old and new up are exact opposites, there are infinitely many possible rotations we could do. So choose the one that maintains the current look vector the best. Replay check so we don't break old stuff.
			let lookVector = new Vector3(0, 0, 1).applyQuaternion(this.camera.orientation);
			let intermediateVector = oldUp.clone().cross(lookVector).normalize();

			// First rotation to the intermediate vector, then rotate from there to the new up
			quatChange.setFromUnitVectors(oldUp, intermediateVector);
			quatChange.multiplyQuaternions(new Quaternion().setFromUnitVectors(intermediateVector, newUp), quatChange);
		} else {
			// Instead of calculating the new quat from nothing, calculate it from the last one to guarantee the shortest possible rotation.
			quatChange.setFromUnitVectors(oldUp, newUp);
		}

		this.newOrientationQuat = quatChange.multiply(currentQuat);
		this.oldOrientationQuat = currentQuat;
		this.orientationChangeTime = instant? -Infinity : time.currentAttemptTime;
	}

	/** Gets the position and orientation of the player spawn point. */
	getStartPositionAndOrientation() {
		// The player is spawned at the last start pad in the mission file.
		let startPad = Util.findLast(this.shapes, (shape) => shape instanceof StartPad);
		let position: Vector3;
		let euler = new Euler();

		if (startPad) {
			// If there's a start pad, start there
			position = startPad.worldPosition;
			euler.setFromQuaternion(startPad.worldOrientation, "ZXY");
		} else {
			// Search for spawn points used for multiplayer
			let spawnPoints = this.mission.allElements.find(x => x._name === "SpawnPoints") as MissionElementSimGroup;
			if (spawnPoints) {
				let first = spawnPoints.elements[0] as MissionElementTrigger;
				position = MisParser.parseVector3(first.position);
			} else {
				// If there isn't anything, start at this weird point
				position = new Vector3(0, 0, 300);
			}
		}

		return { position, euler };
	}

	setGravityIntensity(intensity: number) {
		let gravityVector = this.currentUp.clone().multiplyScalar(-1 * intensity);
		this.world.gravity.copy(gravityVector);
	}

	onResize() {
		if (!this.camera || !this.overlayCamera) return;

		this.camera.aspect = window.innerWidth / window.innerHeight;
		this.camera.updateProjectionMatrix();

		this.overlayCamera.left = 0;
		this.overlayCamera.right = window.innerWidth;
		this.overlayCamera.top = 0;
		this.overlayCamera.bottom = window.innerHeight;
		this.overlayCamera.updateProjectionMatrix();
	}

	onMouseMove(e: MouseEvent) {
		if (!this.started || !document.pointerLockElement || this.finishTime || this.paused || this.replay.mode === 'playback') return;

		let totalDistance = Math.hypot(e.movementX, e.movementY);

		// Strangely enough, Chrome really bugs out sometimes and flings the mouse into a random direction quickly. We try to catch that here and ignore the mouse movement if we detect it.
		if (totalDistance > 350 && this.previousMouseMovementDistance * 4 < totalDistance) {
			this.previousMouseMovementDistance *= 1.5; // Make the condition harder to hit the next time
			return;
		}
		this.previousMouseMovementDistance = totalDistance;

		let factor = Util.lerp(1 / 2500, 1 / 100, StorageManager.data.settings.mouseSensitivity);
		let xFactor = (StorageManager.data.settings.invertMouse & 0b01)? -1 : 1;
		let yFactor = (StorageManager.data.settings.invertMouse & 0b10)? -1 : 1;
		let freeLook = StorageManager.data.settings.alwaysFreeLook || isPressed('freeLook');

		if (freeLook) this.pitch += e.movementY * factor * yFactor;
		this.yaw -= e.movementX * factor * xFactor;
	}

	pickUpPowerUp(powerUp: PowerUp, playPickUpSound = true) {
		if (!powerUp) return false;
		if (this.heldPowerUp && powerUp.constructor === this.heldPowerUp.constructor) return false;
		this.heldPowerUp = powerUp;
		G.menu.hud.setPowerupButtonState(true);

		for (let overlayShape of this.overlayShapes) {
			if (overlayShape.dtsPath.includes("gem")) continue;

			// Show the corresponding icon in the HUD
			overlayShape.setOpacity(Number(overlayShape.dtsPath === powerUp.dtsPath));
		}
		if (playPickUpSound) AudioManager.play(powerUp.sounds[0]);

		return true;
	}

	deselectPowerUp() {
		if (!this.heldPowerUp) {
			G.menu.hud.setPowerupButtonState(false);
			return;
		}
		this.heldPowerUp = null;
		G.menu.hud.setPowerupButtonState(false);

		for (let overlayShape of this.overlayShapes) {
			if (overlayShape.dtsPath.includes("gem")) continue;
			overlayShape.setOpacity(0);
		}
	}

	pickUpGem(t: number) {
		this.gemCount++;
		let string: string;
		let gemWord = (G.modification === 'gold')? 'gem' : 'diamond';

		// Show a notification (and play a sound) based on the gems remaining
		if (this.gemCount === this.totalGems) {
			string = `You have all the ${gemWord}s, head for the finish!`;
			AudioManager.play('gotallgems.wav');

			// Some levels with this package end immediately upon collection of all gems
			if (this.mission.misFile.activatedPackages.includes('endWithTheGems')) {
				this.touchFinish(t);
			}
		} else {
			string = `You picked up a ${gemWord}${G.modification === 'gold' ? '.' : '!'}  `;

			let remaining = this.totalGems - this.gemCount;
			if (remaining === 1) {
				string += `Only one ${gemWord} to go!`;
			} else {
				string += `${remaining} ${gemWord}s to go!`;
			}

			AudioManager.play('gotgem.wav');
		}

		G.menu.hud.displayAlert(string);
		G.menu.hud.displayGemCount(this.gemCount, this.totalGems);
	}

	addTimeTravelBonus(bonus: number, timeToRevert: number) {
		if (this.currentTimeTravelBonus === 0) {
			this.timeState.gameplayClock -= timeToRevert;
			if (this.timeState.gameplayClock < 0) this.timeState.gameplayClock = 0;
			bonus -= timeToRevert;
		}

		this.currentTimeTravelBonus += bonus;
	}

	/** Triggers the out-of-bounds state. */
	goOutOfBounds() {
		if (this.outOfBounds || this.finishTime) return;

		G.menu.hud.setPowerupButtonState(true);
		this.updateCamera(this.timeState); // Update the camera at the point of OOB-ing
		this.outOfBounds = true;
		this.outOfBoundsTime = Util.jsonClone(this.timeState);
		this.oobCameraPosition = this.camera.position.clone();
		G.menu.hud.setCenterText('outofbounds');
		AudioManager.play('whoosh.wav');

		if (this.replay.mode !== 'playback') this.schedule(this.timeState.currentAttemptTime + 2000, () => this.restart(false), 'oobRestart');
	}

	/** Sets a new active checkpoint. */
	saveCheckpointState(shape: Shape, trigger?: CheckpointTrigger) {
		if (this.currentCheckpoint === shape) return;
		if (this.currentCheckpoint?.worldPosition.equals(shape.worldPosition)) return; // Some levels have identical overlapping checkpoints, which can cause an infinite checkpointing loop.

		let disableOob = (shape.srcElement as any)?.disableOob || trigger?.element.disableOob;
		if (MisParser.parseBoolean(disableOob) && this.outOfBounds) return; // The checkpoint is configured to not work when the player is already OOB

		this.currentCheckpoint = shape;
		this.currentCheckpointTrigger = trigger;
		this.checkpointCollectedGems.clear();
		this.checkpointUp = this.currentUp.clone();
		this.checkpointBlast = this.blastAmount;

		// Remember all gems that were collected up to this point
		for (let shape of this.shapes) {
			if (!(shape instanceof Gem)) continue;
			if (shape.pickedUp) this.checkpointCollectedGems.add(shape);
		}

		this.checkpointHeldPowerUp = this.heldPowerUp;

		G.menu.hud.displayAlert("Checkpoint reached!");
		AudioManager.play('checkpoint.wav');
	}

	/** Resets to the last stored checkpoint state. */
	loadCheckpointState() {
		if (!this.currentCheckpoint) return;

		let marble = this.marble;

		// Quite note: Checkpoints have slightly different behavior in Ultra, that's why there's some checks

		let gravityField = (this.currentCheckpoint.srcElement as any)?.gravity || this.currentCheckpointTrigger?.element.gravity;
		if (MisParser.parseBoolean(gravityField) || this.mission.modification === 'ultra') {
			// In this case, we set the gravity to the relative "up" vector of the checkpoint shape.
			let up = new Vector3(0, 0, 1);
			up.applyQuaternion(this.currentCheckpoint.worldOrientation);
			this.setUp(up, true);
		} else {
			// Otherwise, we restore gravity to what was stored.
			this.setUp(this.checkpointUp, true);
		}

		// Determine where to spawn the marble
		let offset = new Vector3();
		let add = (this.currentCheckpoint.srcElement as any)?.add || this.currentCheckpointTrigger?.element.add;
		if (add) offset.add(MisParser.parseVector3(add));
		let sub = (this.currentCheckpoint.srcElement as any)?.sub || this.currentCheckpointTrigger?.element.sub;
		if (sub) offset.sub(MisParser.parseVector3(sub));
		if (!add && !sub) {
			offset.z = 3; // Defaults to (0, 0, 3)

			if (this.mission.modification === 'ultra')
				offset.applyQuaternion(this.currentCheckpoint.worldOrientation); // weird <3
		}

		marble.body.position.copy(this.currentCheckpoint.worldPosition).add(offset);
		marble.body.linearVelocity.setScalar(0);
		marble.body.angularVelocity.setScalar(0);
		marble.calculatePredictiveTransforms();

		// Set camera orienation
		let euler = new Euler();
		euler.setFromQuaternion(this.currentCheckpoint.worldOrientation, "ZXY");
		this.yaw = euler.z + Math.PI/2;
		this.pitch = DEFAULT_PITCH;

		// Restore gem states
		for (let shape of this.shapes) {
			if (!(shape instanceof Gem)) continue;
			if (shape.pickedUp && !this.checkpointCollectedGems.has(shape)) {
				shape.reset();
				this.gemCount--;
			}
		}
		G.menu.hud.displayGemCount(this.gemCount, this.totalGems);
		G.menu.hud.setCenterText('none');

		// Turn all of these off
		marble.superBounceEnableTime = -Infinity;
		marble.shockAbsorberEnableTime = -Infinity;
		marble.helicopterEnableTime = -Infinity;
		marble.megaMarbleEnableTime = -Infinity;

		this.clearSchedule();
		this.outOfBounds = false;
		this.blastAmount = this.checkpointBlast;
		this.finishTime = null; // For those very, very rare cases where the player touched the finish while OOB, but not fast enough, so they get respawned at the checkpoint and we need to remove the "finish lock".

		this.deselectPowerUp(); // Always deselect first
		// Wait a bit to select the powerup to prevent immediately using it incase the user skipped the OOB screen by clicking
		if (this.checkpointHeldPowerUp) this.schedule(this.timeState.currentAttemptTime + 500, () => this.pickUpPowerUp(this.checkpointHeldPowerUp, false));

		AudioManager.play('spawn.wav');
		this.replay.recordCheckpointRespawn();
	}

	touchFinish(completionOfImpact?: number) {
		if (this.finishTime !== null) return;

		this.replay.recordTouchFinish();

		if (this.gemCount < this.totalGems) {
			AudioManager.play('missinggems.wav');
			G.menu.hud.displayAlert((G.modification === 'gold')? "You can't finish without all the gems!!" : "You may not finish without all the diamonds!");
		} else {
			if (completionOfImpact === undefined) completionOfImpact = 1;

			let toSubtract = (1 - completionOfImpact) * 1000 / PHYSICS_TICK_RATE;

			this.finishTime = Util.jsonClone(this.timeState);
			// Compute the precise finish time here
			this.finishTime.timeSinceLoad -= toSubtract;
			this.finishTime.currentAttemptTime -= toSubtract;
			if (this.currentTimeTravelBonus === 0) this.finishTime.gameplayClock -= toSubtract;
			this.finishTime.gameplayClock = Util.clamp(this.finishTime.gameplayClock, 0, MAX_TIME); // Apply the time cap
			this.finishTime.physicsTickCompletion = completionOfImpact;
			this.currentTimeTravelBonus = 0;
			this.alarmSound?.stop();

			if (this.replay.mode === 'playback') this.finishTime = this.replay.finishTime;

			this.finishYaw = this.yaw;
			this.finishPitch = this.pitch;

			let endPad = Util.findLast(this.shapes, (shape) => shape instanceof EndPad) as EndPad;
			endPad?.spawnFirework(this.timeState); // EndPad *might* not exist, in that case no fireworks lol

			G.menu.hud.displayAlert("Congratulations! You've finished!");

			// Check if the player is OOB, but still allow finishing with less than half a second of having been OOB
			if (this.outOfBounds && this.timeState.currentAttemptTime - this.outOfBoundsTime.currentAttemptTime >= 500) return;

			// When we reach this point, the player has actually successfully completed the level.

			this.clearScheduleId('oobRestart'); // Make sure we don't restart the level now
			// Schedule the finish screen to be shown
			if (this.replay.mode !== 'playback') this.schedule(this.timeState.currentAttemptTime + 2000, () => {
				// Show the finish screen
				document.exitPointerLock?.();
				G.menu.finishScreen.show();
				hideTouchControls();

				resetPressedFlag('use');
				resetPressedFlag('jump');
				resetPressedFlag('restart');
			});
		}
	}

	/** Pauses the level. */
	pause() {
		if (this.paused || (G.level.finishTime && G.level.replay.mode === 'record')) return;

		this.paused = true;
		document.exitPointerLock?.();
		releaseAllButtons(); // Safety measure to prevent keys from getting stuck
		G.menu.pauseScreen.show();
		hideTouchControls();
	}

	/** Unpauses the level. */
	unpause() {
		this.paused = false;
		if (!Util.isTouchDevice) Util.requestPointerLock();
		G.menu.pauseScreen.hide();
		this.lastPhysicsTick = performance.now();
		maybeShowTouchControls();
	}

	/** Ends the level irreversibly. */
	stop() {
		this.stopped = true;
		clearInterval(this.tickInterval);
		this.dispose();

		this.music.stop();
		for (let interior of this.interiors) {
			if (interior instanceof PathedInterior) interior.soundSource?.stop();
		}
		for (let shape of this.shapes) {
			if (shape instanceof Tornado || shape instanceof DuctFan) shape.soundSource?.stop();
		}

		this.marble.rollingSound?.stop();
		this.marble.slidingSound?.stop();
		this.marble.helicopterSound?.stop();
		this.marble.shockAbsorberSound?.stop();
		this.marble.superBounceSound?.stop();

		AudioManager.stopAllAudio();
	}

	/** Stops and destroys the current level and returns back to the menu. */
	stopAndExit() {
		this.stop();
		G.level = null;
		mainCanvas.classList.add('hidden');

		G.menu.pauseScreen.hide();
		G.menu.levelSelect.show();
		G.menu.levelSelect.displayBestTimes(); // Potentially update best times having changed
		G.menu.finishScreen.hide();
		G.menu.hideGameUi();
		G.menu.show();

		document.exitPointerLock?.();
	}

	/** Returns how much percent the level has finished loading. */
	getLoadingCompletion() {
		return this.loadingState.total? this.loadingState.loaded / this.loadingState.total : 0;
	}

	/** Disposes the GPU assets used by the level. */
	dispose() {
		this.scene.dispose();
		this.marble.dispose();
		mainRenderer.cleanUp();
	}

	queueStateUpdates() {
		for (let marble of this.marbles) {
			if (marble !== this.marble) continue;
			if (marble.hasNewState) {
				let lastState = Util.last(marble.stateHistory);

				gameServers[0].connection.queueCommand('gameObjectUpdate', {
					gameObjectId: marble.id,
					state: lastState.state
				}, true, 'stateUpdate@' + marble.id);
			}
		}
	}

	onStateUpdate(data: GameServerCommands['gameObjectUpdate']) {
		let marble = this.marbles.find(x => x.id === data.gameObjectId);
		if (marble === this.marble) return;

		if (!marble) {
			marble = this.marblePool.pop();
			marble.id = data.gameObjectId;

			marble.group.setOpacity(1);
			this.world.add(marble.body);
			this.marbles.push(marble);

			console.log("Created");
		}

		marble.loadState(data.state as any); // temp type for now
	}
}