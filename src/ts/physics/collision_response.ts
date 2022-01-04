import THREE from "three";
import { Collision } from "./collision";

let c_1 = new THREE.Vector3();
let c_2 = new THREE.Vector3();
let r_1 = new THREE.Vector3();
let r_2 = new THREE.Vector3();
let x = new THREE.Vector3();
let y = new THREE.Vector3();
let z = new THREE.Vector3();
let B = new THREE.Matrix3();
let BInv = new THREE.Matrix3();
let M_1 = new THREE.Matrix3();
let M_2 = new THREE.Matrix3();
let R_1 = new THREE.Matrix3();
let R_2 = new THREE.Matrix3();
let K_world = new THREE.Matrix3();
let K_contact = new THREE.Matrix3();
let K_contactInv = new THREE.Matrix3();
let theta_1 = new THREE.Vector3();
let theta_2 = new THREE.Vector3();
let deltaDeltaTheta_12 = new THREE.Vector3();
let deltaJ = new THREE.Vector3();
let deltaI = new THREE.Vector3();
let m1 = new THREE.Matrix3();

export abstract class CollisionResponse {
	static solvePosition(collision: Collision) {
		let threshold = 0.01;
		let remainingPenetration = 0.5;

		if (collision.depth < threshold) return;

		let distance = collision.depth - remainingPenetration * threshold;
		collision.s1.body.position.addScaledVector(collision.normal, distance);
	}

	static solveVelocity(collision: Collision) {
		// Approach taken from https://www10.cs.fau.de/publications/theses/2010/Schornbaum_DA_2010.pdf

		collision.s1.getCenter(c_1);
		collision.s2.getCenter(c_2);

		r_1.copy(collision.point).sub(c_1);
		r_2.copy(collision.point).sub(c_2);

		x.copy(collision.normal);

		if (x.z === 0) y.set(x.y, -x.x, 0);
		else y.set(0, x.z, -x.y);
		y.normalize();

		z.copy(x).cross(y);

		B.set(
			x.x, y.x, z.x,
			x.y, y.y, z.y,
			x.z, y.z, z.z
		);
		BInv.copy(B).transpose(); // B is orthonormal

		M_1.identity().multiplyScalar(1 / collision.s1.mass);
		M_2.identity().multiplyScalar(1 / collision.s2.mass);

		R_1.set(
			0, -r_1.z, r_1.y,
			r_1.z, 0, -r_1.x,
			-r_1.y, r_1.x, 0
		);
		R_2.set(
			0, -r_2.z, r_2.y,
			r_2.z, 0, -r_2.x,
			-r_2.y, r_2.x, 0
		);

		const add = (m1: THREE.Matrix3, m2: THREE.Matrix3) => {
			for (let i = 0; i < m1.elements.length; i++) {
				m1.elements[i] += m2.elements[i];
			}
			return m1;
		};

		add(add(K_world.copy(M_1), m1.copy(R_1).multiply(collision.s1.invInertia).multiply(R_1).multiplyScalar(-1)), add(M_2, m1.copy(R_2).multiply(collision.s2.invInertia).multiply(R_2).multiplyScalar(-1)));

		K_contact.copy(BInv).multiply(K_world).multiply(B); // Change of basis thang
		K_contactInv.getInverse(K_contact);

		let b1 = collision.s1.body;
		let b2 = collision.s2.body;

		theta_1.copy(b1.angularVelocity).cross(r_1).add(b1.linearVelocity).applyMatrix3(BInv);
		theta_2.copy(b2.angularVelocity).cross(r_2).add(b2.linearVelocity).applyMatrix3(BInv);

		let deltaThing = theta_1.x - theta_2.x;
		if (deltaThing > -0.0001) return;

		let res = collision.restitution;
		if (deltaThing > -0.5) res = 0;

		deltaDeltaTheta_12.set(-(1 + res) * (theta_1.x - theta_2.x), -(theta_1.y - theta_2.y), -(theta_1.z - theta_2.z));
		deltaJ.copy(deltaDeltaTheta_12).applyMatrix3(K_contactInv);
		let alpha = deltaJ.y**2 + deltaJ.z**2;

		let staticFriction = collision.friction;
		if (alpha > staticFriction**2 * deltaJ.x**2) {
			let beta = collision.friction / Math.sqrt(alpha);
			deltaJ.x = deltaDeltaTheta_12.x / (K_contact.elements[0] + beta * (K_contact.elements[3] * deltaJ.y + K_contact.elements[6] * deltaJ.z));
			let lambda = beta * deltaJ.x;
			deltaJ.y *= lambda;
			deltaJ.z *= lambda;
		}

		deltaI.copy(deltaJ).applyMatrix3(B);

		b1.linearVelocity.addScaledVector(deltaI, 1 / collision.s1.mass);
		b1.angularVelocity.add(r_1.cross(deltaI).applyMatrix3(collision.s1.invInertia));
		b2.linearVelocity.addScaledVector(deltaI, -1 / collision.s2.mass);
		b2.angularVelocity.sub(r_2.cross(deltaI).applyMatrix3(collision.s2.invInertia));
	}
}