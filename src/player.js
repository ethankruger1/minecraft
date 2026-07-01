import * as THREE from 'three';
import { isSolid } from './blocks.js';

const PW = 0.3;     // half width
const PH = 1.8;     // total height
const EYE = 1.62;   // eye height from feet

export class Player {
  constructor(camera) {
    this.camera = camera;
    this.pos = new THREE.Vector3(8, 50, 8);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.flying = true;       // creative starts flying
    this.onGround = false;

    this.speed = 5.6;
    this.sprintMul = 1.9;
    this.flySpeed = 9;
    this.gravity = 26;
    this.jumpV = 8.6;

    this._lastSpace = 0;
  }

  get eyePos() {
    return new THREE.Vector3(this.pos.x, this.pos.y + EYE, this.pos.z);
  }

  forwardDir() {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  lookDir() {
    const cp = Math.cos(this.pitch);
    return new THREE.Vector3(
      -Math.sin(this.yaw) * cp,
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * cp
    ).normalize();
  }

  addLook(dx, dy) {
    this.yaw -= dx;
    this.pitch -= dy;
    const lim = Math.PI / 2 - 0.01;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
  }

  tryToggleFly() {
    const now = performance.now();
    if (now - this._lastSpace < 300) {
      this.flying = !this.flying;
      this.vel.y = 0;
    }
    this._lastSpace = now;
  }

  collides(world, px, py, pz) {
    const minX = Math.floor(px - PW), maxX = Math.floor(px + PW);
    const minY = Math.floor(py), maxY = Math.floor(py + PH - 0.001);
    const minZ = Math.floor(pz - PW), maxZ = Math.floor(pz + PW);
    for (let x = minX; x <= maxX; x++)
      for (let y = minY; y <= maxY; y++)
        for (let z = minZ; z <= maxZ; z++)
          if (isSolid(world.getBlock(x, y, z))) return true;
    return false;
  }

  update(dt, world, input) {
    // --- desired horizontal movement ---
    const fwd = this.forwardDir();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x); // forward × up
    const wish = new THREE.Vector3();
    if (input.forward) wish.add(fwd);
    if (input.back) wish.sub(fwd);
    if (input.right) wish.add(right);
    if (input.left) wish.sub(right);
    if (wish.lengthSq() > 0) wish.normalize();

    let spd = this.flying ? this.flySpeed : this.speed;
    if (input.sprint) spd *= this.sprintMul;

    if (this.flying) {
      this.vel.x = wish.x * spd;
      this.vel.z = wish.z * spd;
      let vy = 0;
      if (input.up) vy += spd;
      if (input.down) vy -= spd;
      this.vel.y = vy;
    } else {
      this.vel.x = wish.x * spd;
      this.vel.z = wish.z * spd;
      this.vel.y -= this.gravity * dt;
      if (input.up && this.onGround) { this.vel.y = this.jumpV; this.onGround = false; }
    }

    this._move(world, this.vel.x * dt, 0, 0);
    this._move(world, 0, 0, this.vel.z * dt);
    this.onGround = false;
    this._moveY(world, this.vel.y * dt);

    this.camera.position.copy(this.eyePos);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  }

  _move(world, dx, dy, dz) {
    const nx = this.pos.x + dx, nz = this.pos.z + dz;
    if (dx !== 0 && !this.collides(world, nx, this.pos.y, this.pos.z)) this.pos.x = nx;
    if (dz !== 0 && !this.collides(world, this.pos.x, this.pos.y, nz)) this.pos.z = nz;
  }

  _moveY(world, dy) {
    const ny = this.pos.y + dy;
    if (!this.collides(world, this.pos.x, ny, this.pos.z)) {
      this.pos.y = ny;
    } else {
      if (dy < 0) this.onGround = true;
      this.vel.y = 0;
    }
  }
}
