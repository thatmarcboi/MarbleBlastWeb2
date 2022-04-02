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

	tick = -1;
	attemptTick = -1;
	clock = 0;

	get time() {
		return (this.tick + this.subtickCompletion) / GAME_UPDATE_RATE;
	}

	get attemptTime() {
		return (this.attemptTick + this.subtickCompletion) / GAME_UPDATE_RATE;
	}

	subtickCompletion = 0;

	stateHistory = new DefaultMap<number, EntityUpdate[]>(() => []);

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

		this.tick++;
		this.attemptTick++;
	}

	restart() {
		let { game } = this;
		let hud = state.menu.hud;

		this.clock = 0;
		this.attemptTick = -1;
		this.currentTimeTravelBonus = 0;

		if (game.totalGems > 0) {
			this.collectedGems = 0;
			hud.displayGemCount(this.collectedGems, game.totalGems);
		}

		let marble = game.marble;
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
			if (!entity.hasChangedState) continue;

			let arr = this.stateHistory.get(entity.id);
			if (Util.last(arr)?.frame === this.tick) arr.pop();

			let stateUpdate: EntityUpdate = {
				updateId: this.nextUpdateId++,
				entityId: entity.id,
				frame: this.tick,
				owned: entity.owned,
				challengeable: entity.challengeable,
				originator: this.game.playerId,
				version: entity.version,
				state: entity.getCurrentState()
			};
			arr.push(stateUpdate);

			entity.hasChangedState = false;
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
		if (target === this.tick) return;

		while (this.affectionGraph.length > 0 && Util.last(this.affectionGraph).frame > target)
			this.affectionGraph.pop();

		for (let [entityId, updateHistory] of this.stateHistory) {
			let changed = false;
			while (Util.last(updateHistory) && Util.last(updateHistory).frame > target) {
				updateHistory.pop();
				changed = true;
			}

			if (!changed) continue;

			let entity = this.game.entities.find(x => x.id === entityId); // todo optimize

			let update = Util.last(updateHistory);
			let state = update?.state ?? entity.getInitialState();

			entity.loadState(state, target);
		}

		this.game.simulator.world.updateCollisions(); // Since positions might have changed, collisions probably have too

		this.tick = target;
		// todo: attemptTick
	}

	applyEntityUpdate(update: EntityUpdate): boolean {
		let entity = this.game.entities.find(x => x.id === update.entityId); // todo optimize
		if (!entity) return false; // temp right?

		let us = this.game.playerId;
		let shouldApplyState = (update.originator !== us && !entity.owned) || update.version > entity.version;

		if (shouldApplyState) {
			//console.log(us, update.originator, update.version, entity.version);
			entity.loadState(update.state, update.frame);
			entity.version = update.version;

			entity.hasChangedState = true;

			return true; // Meaning the update has actually been applied
		}

		return false;
	}

	recordEntityInteraction(o1: Entity, o2: Entity) {
		this.affectionGraph.push({
			id: this.nextAffectionEdgeId++,
			from: o1,
			to: o2,
			frame: this.tick
		});
	}

	setOwned(o: Entity) {
		if (o.owned) return;
		o.owned = true;
	}
}