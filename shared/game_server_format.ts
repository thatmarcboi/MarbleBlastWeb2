import { FixedFormatBinarySerializer, FormatToType, nullable, union } from "./fixed_format_binary_serializer";

const vector2Format = { x: 'f32', y: 'f32' } as const;
const vector3Format = { x: 'f32', y: 'f32', z: 'f32' } as const;
const quaternionFormat = { x: 'f32', y: 'f32', z: 'f32', w: 'f32' } as const;

export const entityStateFormat = [union, 'entityType', {
	entityType: 'marble',
	position: vector3Format,
	orientation: quaternionFormat,
	linearVelocity: vector3Format,
	angularVelocity: vector3Format
}, {
	entityType: 'player',
	movement: vector2Format,
	yaw: 'f32',
	pitch: 'f32',
	jumping: 'boolean',
	using: 'boolean',
	blasting: 'boolean'
}, {
	entityType: 'clock',
	time: 'f64'
}] as const;

export const entityUpdateFormat = {
	updateId: 'varint',
	entityId: 'varint',
	frame: 'varint',
	owned: 'boolean',
	challengeable: 'boolean',
	originator: 'varint',
	version: 'varint',
	state: entityStateFormat
} as const;

export type EntityState = FormatToType<typeof entityStateFormat>;

export const gameServerCommandFormat = [union, 'command', {
	command: 'ping',
	timestamp: 'f32'
}, {
	command: 'pong',
	timestamp: 'f32',
	subtract: 'f32'
}, {
	command: 'joinMission',
	missionPath: 'string'
}, {
	command: 'clientStateBundle',
	serverFrame: 'varint',
	clientFrame: 'varint',
	periods: [{
		id: 'varint',
		start: 'varint',
		end: 'varint',
		entityUpdates: [entityUpdateFormat],
		affectionGraph: [{ from: 'varint', to: 'varint' }],
		entityInfo: [{
			entityId: 'varint',
			earliestUpdateFrame: 'varint',
			ownedAtSomePoint: 'boolean'
		}]
	}],
	lastReceivedServerUpdateId: 'varint'
}, {
	command: 'serverStateBundle',
	serverFrame: 'varint',
	clientFrame: 'varint',
	entityUpdates: [entityUpdateFormat],
	lastReceivedPeriodId: 'varint',
	rewindToFrameCap: 'varint'
}, {
	command: 'gameJoinInfo',
	serverFrame: 'varint',
	clientFrame: 'varint',
	players: [{
		id: 'varint',
		marbleId: 'varint'
	}],
	localPlayerId: 'varint',
	entityStates: [entityUpdateFormat]
}, {
	command: 'playerJoin',
	id: 'varint',
	marbleId: 'varint'
}] as const;

export const gameServerMessageFormat = FixedFormatBinarySerializer.format({
	packetId: 'varint',
	ack: 's32',
	commands: [gameServerCommandFormat]
} as const);

export type GameServerMessage = FormatToType<typeof gameServerMessageFormat>;
export type GameServerCommands = GameServerMessage['commands'][number]['command'];

export type CommandToData<K extends GameServerCommands> = DistributeyThing<GameServerMessage['commands'][number], K>;
type DistributeyThing<U, K> = U extends { command: K } ? U : never;

export type EntityUpdate = Omit<FormatToType<typeof entityUpdateFormat>, 'command'>;