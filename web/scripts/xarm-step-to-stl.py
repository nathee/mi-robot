# Split Hiwonder's xArm2.0.stp into per-link binary STLs for the simulator
# (meters, each link in its MDH frame at the home pose, per-face colors in the VisCAM format).
#
# Run from web/:  XARM_FK=fk.json freecadcmd -c "exec(open('scripts/xarm-step-to-stl.py').read())"
# XARM_FK is a JSON array of the six home-pose link matrices (Matrix4.elements) from
# forwardTxRxTzRz([0,0,0,0,0,0]) with the xarm2 profile active; regenerate it if the MDH table changes.
# Part indices below refer to the solid order of this exact STEP file (FreeCAD 1.1).
import json, struct, math, os
import Part, MeshPart

STEP = "public/models/xArm2.0.stp"
OUT = "public/models/xarm2"
os.makedirs(OUT, exist_ok=True)

shape = Part.Shape(); shape.read(STEP)
S = shape.Solids

# --- CAD axes (mm), measured from the horn cylinder faces -----------------------------------
AX, AY = 0.4, -6.29          # roll axis / pitch-axis line (CAD x, y)
SHOULDER, ELBOW, WRIST = 5.65, 106.15, 200.85
# Per-link z shift so each link's proximal joint lands on the profile's MDH frame (65/166/261 mm)
DZ = {"base": 65 - SHOULDER, "link1": 65 - SHOULDER, "link2": 65 - SHOULDER,
      "link3": 166 - ELBOW, "link4": 261 - WRIST, "link5": 261 - WRIST, "tool": 261 - WRIST}

# --- assignment of the large parts --------------------------------------------------------
explicit = {
    "link1": [0, 1, 2, 121],
    "link2": [230, 231, 4, 5, 6, 13, 14],
    "link3": [7, 8, 9, 10, 11, 12, 19, 20, 21, 22, 23, 24, 25, 26, 27],
    "link4": [28, 29, 34, 35, 36, 38, 39, 40, 41],
    "link5": [42],
    "driver": [61], "idler": [63, 66], "finger": [55, 56, 52],
    "drop": [62, 64, 65, 53, 54, 51],   # right-hand finger train: rebuilt by mirroring the left one
}
owner = {}
for g, ids in explicit.items():
    for i in ids: owner[i] = g
BIG = 200
for i, s in enumerate(S):
    if i in owner or s.Volume < BIG: continue
    bb = s.BoundBox
    if bb.ZMax <= -9.5: owner[i] = "base"
    elif bb.ZMin >= 250: owner[i] = "gripper"
    else: print("UNASSIGNED big", i, round(s.Volume), bb)

big = [i for i in owner]
for i, s in enumerate(S):
    if i in owner: continue
    c = s.BoundBox.Center
    best, bestv = None, 1e18
    for j in big:
        b = S[j].BoundBox
        if b.XMin - 1 <= c.x <= b.XMax + 1 and b.YMin - 1 <= c.y <= b.YMax + 1 and b.ZMin - 1 <= c.z <= b.ZMax + 1:
            v = b.XLength * b.YLength * b.ZLength
            if v < bestv: best, bestv = j, v
    if best is None:
        best = min(big, key=lambda j: (S[j].BoundBox.Center - c).Length)
    owner[i] = owner[best]

# --- colors (sRGB) ----------------------------------------------------------------------
BLUE, DARK, SILVER, RUBBER, CUP, PLATE = (0x1e, 0x88, 0xe5), (0x24, 0x26, 0x2b), (0xb8, 0xbe, 0xc6), (0x14, 0x15, 0x18), (0xdd, 0xe3, 0xea), (0x1a, 0x1c, 0x20)
SERVO_VOLS = {7713, 6673, 2041, 1185, 760, 8396, 8485}
def color(i):
    s = S[i]; v = round(s.Volume)
    if i in (122, 123, 124, 125): return CUP
    if i in (227, 114, 233, 228, 229): return PLATE
    if i in (51, 52): return RUBBER
    if i in (1, 2, 57, 58, 59, 84) or v in SERVO_VOLS: return DARK
    if v < 300 or i in (13, 14, 28, 29, 121, 230, 231, 42, 82, 76): return SILVER
    return BLUE

# --- link frames from the app's FK (home pose, meters) -------------------------------------
fk = json.load(open(os.environ["XARM_FK"]))
def frame(e):  # column-major Matrix4 -> (R rows, origin mm)
    R = [[e[c * 4 + r] for c in range(3)] for r in range(3)]
    o = [e[12] * 1000, e[13] * 1000, e[14] * 1000]
    return R, o
FR = {"base": ([[1, 0, 0], [0, 1, 0], [0, 0, 1]], [0, 0, 0])}
for k in range(6): FR[f"link{k + 1}"] = frame(fk[k])
FR["tool"] = FR["link6"]

def to_local(p, link, dz_extra=0.0):
    w = (-(p[1] - AY), p[0] - AX, p[2] + DZ[link] + dz_extra)
    R, o = FR[link]
    d = (w[0] - o[0], w[1] - o[1], w[2] - o[2])
    # local = R^T d, in meters
    return tuple(sum(R[r][c] * d[r] for r in range(3)) * 0.001 for c in range(3))

def pack(rgb):
    r, g, b = (round(x / 255 * 31) for x in rgb)
    return r | (g << 5) | (b << 10)   # bit 15 clear = per-face color

def write(name, items):
    tris = []
    for link, solid, rgb, dz in items:
        m = MeshPart.meshFromShape(Shape=solid, LinearDeflection=0.35, AngularDeflection=0.6, Relative=False)
        if m.CountFacets > 300:
            m.decimate(0.08, 0.6)
        pts = [to_local((v.x, v.y, v.z), link, dz) for v in m.Points]
        col = pack(rgb)
        for f in m.Topology[1]:
            tris.append((pts[f[0]], pts[f[1]], pts[f[2]], col))
    hdr = b"COLOR=\xbd\xbd\xbd\xff xArm 2.0 from Hiwonder STEP; meters, MDH link frame"
    hdr = hdr.ljust(80, b" ")
    with open(os.path.join(OUT, name + ".stl"), "wb") as f:
        f.write(hdr); f.write(struct.pack("<I", len(tris)))
        for a, b, c, col in tris:
            u = [b[k] - a[k] for k in range(3)]; v = [c[k] - a[k] for k in range(3)]
            n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
            l = math.sqrt(sum(x * x for x in n)) or 1
            f.write(struct.pack("<12fH", *(x / l for x in n), *a, *b, *c, col))
    print(name, len(tris), "tris", os.path.getsize(os.path.join(OUT, name + ".stl")) // 1024, "KB")

groups = {}
for i, g in owner.items():
    if g == "drop": continue
    link = {"gripper": "tool", "driver": "tool", "idler": "tool", "finger": "tool"}.get(g, g)
    dz = 12.95 if i in (122, 123, 124, 125) else 0.0  # seat the suction cups on the table
    groups.setdefault(g, []).append((link, S[i], color(i), dz))
for g, items in sorted(groups.items()):
    write(g, items)

# Finger-train pivots (CAD x,z; axis along CAD y) -> tool frame, for the gripper animation
for nm, p in {"driverPivot": (-13.6, 284.3), "idlerPivot": (-4.6, 303.3), "fingerPin": (-28.0, 309.5), "tipInner": (-9.7, 356.0)}.items():
    print("PIVOT", nm, [round(x * 1000, 2) for x in to_local((p[0], AY, p[1]), "tool")])
