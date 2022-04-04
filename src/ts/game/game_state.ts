import { GAME_UPDATE_RATE } from "../../../shared/constants";
import { DefaultMap } from "../../../shared/default_map";
import { EntityUpdate } from "../../../shared/game_server_format";
import { AudioManager } from "../audio";
import { DEFAULT_PITCH, PHYSICS_TICK_RATE } from "../level";
import { Euler } from "../math/euler";
import { Vector3 } from "../math/vector3";
import { MissionElementSimGroup, MissionElementTrigger, MisParser } from "../parsing/mis_parser";
import { StartPad } from "../shapes/start_pad";
import { state } from "../state";
import { Util } from "../util";
import { Game } from "./game";
import { Entity } from "./entity";

interface AffectionEdge {
	id: number,
	from: Entity,
	to: Entity,
	frame: number
}

export const GO_TIME = 0 ?? 3.5; // fixme

export class GameState {
	game: Game;
	id = 0;

	frame = -1;
	attemptFrame = -1;
	clock = 0;

	get time() {
		return (this.frame + this.subframeCompletion) / GAME_UPDATE_RATE;
	}

	get attemptTime() {
		return (this.attemptFrame + this.subframeCompletion) / GAME_UPDATE_RATE;
	}

	subframeCompletion = 0;

	stateHistory = new DefaultMap<number, EntityUpdate[]>(() => []);
	internalStateHistory = new DefaultMap<number, { frame: number, state: any }[]>(() => []);

	collectedGems = 0;
	currentTimeTravelBonus = 0;

	affectionGraph: AffectionEdge[] = [];

	nextUpdateId = 0;
	nextAffectionEdgeId = 0;

	constructor(game: Game) {
		this.game = game;
	}

	advanceTime() {
		if (this.attemptTime >= GO_TIME) {
			if (this.currentTimeTravelBonus > 0) {
				// Subtract remaining time travel time
				this.currentTimeTravelBonus -= 1 / GAME_UPDATE_RATE;
			} else {
				// Increase the gameplay time
				this.clock += 1 / PHYSICS_TICK_RATE;
			}

			if (this.currentTimeTravelBonus < 0) {
				// If we slightly undershot the zero mark of the remaining time travel bonus, add the "lost time" back onto the gameplay clock:
				this.clock += -this.currentTimeTravelBonus;
				this.currentTimeTravelBonus = 0;
			}
		}

		this.frame++;
		this.attemptFrame++;
	}

	restart() {
		let { game } = this;
		let hud = state.menu.hud;

		this.clock = 0;
		this.attemptFrame = -1;
		this.currentTimeTravelBonus = 0;

		if (game.totalGems > 0) {
			this.collectedGems = 0;
			hud.displayGemCount(this.collectedGems, game.totalGems);
		}

		let marble = game.localPlayer.controlledMarble;
		let { position: startPosition, euler } = this.getStartPositionAndOrientation();

		// Todo put all this shit into marble bro! what the fuck are you thinking
		// Place the marble a bit above the start pad position
		marble.body.position.set(startPosition.x, startPosition.y, startPosition.z + 3);
		marble.body.syncShapes();
		marble.group.position.copy(marble.body.position);
		marble.group.recomputeTransform();
		marble.reset();
		marble.calculatePredictiveTransforms();

		let missionInfo = game.mission.missionInfo;
		if (missionInfo.starthelptext)
			hud.displayHelp(missionInfo.starthelptext); // Show the start help text

		for (let entity of game.entities) entity.reset();

		game.timeTravelSound?.stop();
		game.timeTravelSound = null;
		game.alarmSound?.stop();
		game.alarmSound = null;

		AudioManager.play('spawn.wav');
	}

	saveStates() {
		for (let i = 0; i < this.game.entities.length; i++) {
			let entity = this.game.entities[i];

			if (entity.stateNeedsStore) {
				let arr = this.stateHistory.get(entity.id);
				if (Util.last(arr)?.frame === this.frame) arr.pop();

				let stateUpdate: EntityUpdate = {
					updateId: this.nextUpdateId++,
					entityId: entity.id,
					frame: this.frame,
					owned: entity.owned,
					challengeable: entity.challengeable,
					originator: this.game.localPlayer.id,
					version: entity.version,
					state: entity.getCurrentState()
				};
				arr.push(stateUpdate);

				entity.stateNeedsStore = false;
			}

			if (entity.internalStateNeedsStore) {
				let arr = this.internalStateHistory.get(entity.id);
				if (Util.last(arr)?.frame === this.frame) arr.pop();

				arr.push({
					frame: (arr.length === 0)? -1 : this.frame,
					state: entity.getInternalState()
				});

				entity.internalStateNeedsStore = false;
			}
		}
	}

	/** Gets the position and orientation of the player spawn point. */
	getStartPositionAndOrientation() {
		let { game } = this;

		// The player is spawned at the last start pad in the mission file.
		let startPad = Util.findLast(game.shapes, (shape) => shape instanceof StartPad);
		let position: Vector3;
		let euler = new Euler();

		if (startPad) {
			// If there's a start pad, start there
			position = startPad.worldPosition;
			euler.setFromQuaternion(startPad.worldOrientation, "ZXY");
		} else {
			// Search for spawn points used for multiplayer
			let spawnPoints = game.mission.allElements.find(x => x._name === "SpawnPoints") as MissionElementSimGroup;
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

	rollBackToFrame(target: number) {
		if (target === this.frame) return;

		while (this.affectionGraph.length > 0 && Util.last(this.affectionGraph).frame > target)
			this.affectionGraph.pop();

		for (let [entityId, history] of this.internalStateHistory) {
			while (history.length > 0 && Util.last(history).frame > target) history.pop();

			let entity = this.game.getEntityById(entityId);
			let last = Util.last(history);
			entity.loadInternalState(last.state, last.frame);
		}

		for (let [entityId, updateHistory] of this.stateHistory) {
			let changed = false;
			while (Util.last(updateHistory) && Util.last(updateHistory).frame > target) {
				updateHistory.pop();
				changed = true;
			}

			if (!changed) continue;

			let entity = this.game.getEntityById(entityId);

			let update = Util.last(updateHistory);
			let state = update?.state ?? entity.getInitialState();

			entity.loadState(state, {
				frame: update?.frame ?? 0,
				remote: false
			});
			entity.version = update?.version ?? 0;
		}

		this.saveStates();

		this.frame = target;
		// todo: attemptTick
	}

	recordEntityInteraction(o1: Entity, o2: Entity) {
		this.affectionGraph.push({
			id: this.nextAffectionEdgeId++,
			from: o1,
			to: o2,
			frame: this.frame
		});
	}
}