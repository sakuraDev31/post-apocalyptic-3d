class_name SeededNoise
extends RefCounted

## Deterministic Mulberry32 PRNG + 2D/3D Simplex Noise + fBm + Ridge + Splines

class PRNG extends RefCounted:
	var s: int

	func _init(seed_val: int = 1337) -> void:
		s = seed_val if seed_val != 0 else 1

	## Returns float in [0.0, 1.0)
	func next_float() -> float:
		s = (s + 0x6d2b79f5) & 0xFFFFFFFF
		var t: int = ((s ^ (s >> 15)) * (1 | s)) & 0xFFFFFFFF
		t = (t + (((t ^ (t >> 7)) * (61 | t)) & 0xFFFFFFFF)) ^ t
		return float(((t ^ (t >> 14)) & 0xFFFFFFFF)) / 4294967296.0

	func rand_range(min_v: float, max_v: float) -> float:
		return min_v + next_float() * (max_v - min_v)

	func rand_int(min_v: int, max_v: int) -> int:
		return int(floor(min_v + next_float() * (max_v - min_v + 1)))

	func rand_choice(arr: Array):
		if arr.is_empty():
			return null
		return arr[int(floor(next_float() * arr.size()))]

static func create_prng(seed_val: int = 1337) -> PRNG:
	return PRNG.new(seed_val)

# --- Simplex Noise (2D & 3D) ---
class Simplex extends RefCounted:
	var perm: PackedByteArray = PackedByteArray()
	var perm_mod12: PackedByteArray = PackedByteArray()

	const F2: float = 0.5 * (1.7320508075688772 - 1.0)
	const G2: float = (3.0 - 1.7320508075688772) / 6.0
	const F3: float = 1.0 / 3.0
	const G3: float = 1.0 / 6.0

	const GRAD3 = [
		Vector3(1, 1, 0), Vector3(-1, 1, 0), Vector3(1, -1, 0), Vector3(-1, -1, 0),
		Vector3(1, 0, 1), Vector3(-1, 0, 1), Vector3(1, 0, -1), Vector3(-1, 0, -1),
		Vector3(0, 1, 1), Vector3(0, -1, 1), Vector3(0, 1, -1), Vector3(0, -1, -1)
	]

	func _init(seed_val: int = 1337) -> void:
		perm.resize(512)
		perm_mod12.resize(512)
		var prng = PRNG.new(seed_val)
		var p: Array[int] = []
		p.resize(256)
		for i in 256:
			p[i] = i
		# Fisher-Yates
		for i in range(255, 0, -1):
			var j = int(floor(prng.next_float() * (i + 1)))
			var tmp = p[i]
			p[i] = p[j]
			p[j] = tmp
		for i in 512:
			perm[i] = p[i & 255]
			perm_mod12[i] = perm[i] % 12

	func noise2D(xin: float, yin: float) -> float:
		var s: float = (xin + yin) * F2
		var i: int = int(floor(xin + s))
		var j: int = int(floor(yin + s))
		var t: float = float(i + j) * G2
		var X0: float = float(i) - t
		var Y0: float = float(j) - t
		var x0: float = xin - X0
		var y0: float = yin - Y0

		var i1: int = 1 if x0 > y0 else 0
		var j1: int = 0 if x0 > y0 else 1

		var x1: float = x0 - float(i1) + G2
		var y1: float = y0 - float(j1) + G2
		var x2: float = x0 - 1.0 + 2.0 * G2
		var y2: float = y0 - 1.0 + 2.0 * G2

		var ii: int = i & 255
		var jj: int = j & 255
		var gi0: int = perm_mod12[ii + perm[jj]]
		var gi1: int = perm_mod12[ii + i1 + perm[jj + j1]]
		var gi2: int = perm_mod12[ii + 1 + perm[jj + 1]]

		var n0: float = 0.0
		var n1: float = 0.0
		var n2: float = 0.0

		var t0: float = 0.5 - x0 * x0 - y0 * y0
		if t0 > 0.0:
			t0 *= t0
			var g = GRAD3[gi0]
			n0 = t0 * t0 * (g.x * x0 + g.y * y0)

		var t1: float = 0.5 - x1 * x1 - y1 * y1
		if t1 > 0.0:
			t1 *= t1
			var g = GRAD3[gi1]
			n1 = t1 * t1 * (g.x * x1 + g.y * y1)

		var t2: float = 0.5 - x2 * x2 - y2 * y2
		if t2 > 0.0:
			t2 *= t2
			var g = GRAD3[gi2]
			n2 = t2 * t2 * (g.x * x2 + g.y * y2)

		return 70.0 * (n0 + n1 + n2)

	func noise3D(xin: float, yin: float, zin: float) -> float:
		var s: float = (xin + yin + zin) * F3
		var i: int = int(floor(xin + s))
		var j: int = int(floor(yin + s))
		var k: int = int(floor(zin + s))
		var t: float = float(i + j + k) * G3
		var x0: float = xin - (float(i) - t)
		var y0: float = yin - (float(j) - t)
		var z0: float = zin - (float(k) - t)

		var i1: int; var j1: int; var k1: int
		var i2: int; var j2: int; var k2: int

		if x0 >= y0:
			if y0 >= z0:
				i1=1; j1=0; k1=0; i2=1; j2=1; k2=0
			elif x0 >= z0:
				i1=1; j1=0; k1=0; i2=1; j2=0; k2=1
			else:
				i1=0; j1=0; k1=1; i2=1; j2=0; k2=1
		else:
			if y0 < z0:
				i1=0; j1=0; k1=1; i2=0; j2=1; k2=1
			elif x0 < z0:
				i1=0; j1=1; k1=0; i2=0; j2=1; k2=1
			else:
				i1=0; j1=1; k1=0; i2=1; j2=1; k2=0

		var x1 = x0 - float(i1) + G3
		var y1 = y0 - float(j1) + G3
		var z1 = z0 - float(k1) + G3
		var x2 = x0 - float(i2) + 2.0 * G3
		var y2 = y0 - float(j2) + 2.0 * G3
		var z2 = z0 - float(k2) + 2.0 * G3
		var x3 = x0 - 1.0 + 3.0 * G3
		var y3 = y0 - 1.0 + 3.0 * G3
		var z3 = z0 - 1.0 + 3.0 * G3

		var ii = i & 255; var jj = j & 255; var kk = k & 255
		var gi0 = perm_mod12[ii + perm[jj + perm[kk]]]
		var gi1 = perm_mod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]]
		var gi2 = perm_mod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]]
		var gi3 = perm_mod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]]

		var n0 = 0.0; var n1 = 0.0; var n2 = 0.0; var n3 = 0.0

		var t0 = 0.6 - x0*x0 - y0*y0 - z0*z0
		if t0 > 0.0:
			t0 *= t0
			var g = GRAD3[gi0]
			n0 = t0 * t0 * (g.x * x0 + g.y * y0 + g.z * z0)

		var t1 = 0.6 - x1*x1 - y1*y1 - z1*z1
		if t1 > 0.0:
			t1 *= t1
			var g = GRAD3[gi1]
			n1 = t1 * t1 * (g.x * x1 + g.y * y1 + g.z * z1)

		var t2 = 0.6 - x2*x2 - y2*y2 - z2*z2
		if t2 > 0.0:
			t2 *= t2
			var g = GRAD3[gi2]
			n2 = t2 * t2 * (g.x * x2 + g.y * y2 + g.z * z2)

		var t3 = 0.6 - x3*x3 - y3*y3 - z3*z3
		if t3 > 0.0:
			t3 *= t3
			var g = GRAD3[gi3]
			n3 = t3 * t3 * (g.x * x3 + g.y * y3 + g.z * z3)

		return 32.0 * (n0 + n1 + n2 + n3)

	func fbm2D(x: float, y: float, octaves: int = 4, lacunarity: float = 2.0, gain: float = 0.5) -> float:
		var total = 0.0
		var frequency = 1.0
		var amplitude = 1.0
		var max_val = 0.0
		for o in octaves:
			total += noise2D(x * frequency, y * frequency) * amplitude
			max_val += amplitude
			frequency *= lacunarity
			amplitude *= gain
		return total / max_val

	func fbm3D(x: float, y: float, z: float, octaves: int = 4, lacunarity: float = 2.0, gain: float = 0.5) -> float:
		var total = 0.0
		var frequency = 1.0
		var amplitude = 1.0
		var max_val = 0.0
		for o in octaves:
			total += noise3D(x * frequency, y * frequency, z * frequency) * amplitude
			max_val += amplitude
			frequency *= lacunarity
			amplitude *= gain
		return total / max_val

	func ridge_noise2D(x: float, y: float, octaves: int = 4, lacunarity: float = 2.0, gain: float = 0.5) -> float:
		var total = 0.0
		var frequency = 1.0
		var amplitude = 1.0
		var weight = 1.0
		for o in octaves:
			var sig = abs(noise2D(x * frequency, y * frequency))
			sig = 1.0 - sig
			sig *= sig * weight
			weight = clamp(sig * 2.0, 0.0, 1.0)
			total += sig * amplitude
			frequency *= lacunarity
			amplitude *= gain
		return total

# --- Spline & Catenary Helpers ---
static func catmull_rom_point(p0: Vector3, p1: Vector3, p2: Vector3, p3: Vector3, t: float) -> Vector3:
	var t2 = t * t
	var t3 = t2 * t
	return 0.5 * (
		(2.0 * p1) +
		(-p0 + p2) * t +
		(2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2 +
		(-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3
	)

static func evaluate_spline(pts: Array[Vector3], t: float, closed: bool = false) -> Vector3:
	var n = pts.size()
	if n < 2:
		return pts[0] if n > 0 else Vector3.ZERO
	if n == 2:
		return pts[0].lerp(pts[1], t)

	var cl_t = clamp(t, 0.0, 1.0)
	var segments = n if closed else n - 1
	var seg_prog = cl_t * float(segments)
	var idx = mini(int(floor(seg_prog)), segments - 1)
	var local_t = seg_prog - float(idx)

	var p0: Vector3; var p1: Vector3; var p2: Vector3; var p3: Vector3
	if closed:
		p0 = pts[(idx - 1 + n) % n]
		p1 = pts[idx]
		p2 = pts[(idx + 1) % n]
		p3 = pts[(idx + 2) % n]
	else:
		p0 = pts[0] if idx == 0 else pts[idx - 1]
		p1 = pts[idx]
		p2 = pts[idx + 1]
		p3 = pts[idx + 2] if idx + 2 < n else pts[n - 1]

	return catmull_rom_point(p0, p1, p2, p3, local_t)

static func generate_catenary(start: Vector3, end_pos: Vector3, sag: float = 1.2, segments: int = 16) -> Array[Vector3]:
	var result: Array[Vector3] = []
	for i in range(segments + 1):
		var t = float(i) / float(segments)
		var x = lerp(start.x, end_pos.x, t)
		var z = lerp(start.z, end_pos.z, t)
		var linear_y = lerp(start.y, end_pos.y, t)
		var droop = 4.0 * sag * t * (1.0 - t)
		result.append(Vector3(x, linear_y - droop, z))
	return result
