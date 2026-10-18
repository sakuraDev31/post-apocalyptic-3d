class_name TouchControls
extends Control

@export var look_sensitivity: float = 0.004

var look_touch_id: int = -1
var last_look_pos: Vector2 = Vector2.ZERO

@onready var joystick: Control = $LeftTouchZone/VirtualJoystick
@onready var look_zone: Control = $RightLookZone

var player_ref: CharacterBody3D = null

func setup(player: CharacterBody3D) -> void:
	player_ref = player
	if joystick:
		joystick.joystick_moved.connect(_on_joystick_moved)

func _ready() -> void:
	# Action buttons signals
	if has_node("ActionCluster/JumpBtn"):
		$ActionCluster/JumpBtn.pressed.connect(_on_jump_pressed)
	if has_node("ActionCluster/SprintBtn"):
		$ActionCluster/SprintBtn.toggled.connect(_on_sprint_toggled)
	if has_node("ActionCluster/CrouchBtn"):
		$ActionCluster/CrouchBtn.pressed.connect(_on_crouch_pressed)
	if has_node("ActionCluster/CameraBtn"):
		$ActionCluster/CameraBtn.pressed.connect(_on_camera_pressed)

func _on_joystick_moved(vec: Vector2) -> void:
	if player_ref:
		player_ref.external_move_vector = vec

func _on_jump_pressed() -> void:
	if player_ref:
		player_ref.trigger_jump()

func _on_sprint_toggled(toggled_on: bool) -> void:
	if player_ref:
		player_ref.set_touch_sprint(toggled_on)

func _on_crouch_pressed() -> void:
	if player_ref:
		player_ref.toggle_crouch()

func _on_camera_pressed() -> void:
	if player_ref and player_ref.camera_rig:
		player_ref.camera_rig.toggle_camera_mode()

func _gui_input(event: InputEvent) -> void:
	# Right half of screen touch drag for camera rotation
	if event is InputEventScreenTouch:
		if event.position.x > size.x * 0.45:
			if event.pressed and look_touch_id == -1:
				look_touch_id = event.index
				last_look_pos = event.position
			elif not event.pressed and event.index == look_touch_id:
				look_touch_id = -1

	elif event is InputEventScreenDrag and event.index == look_touch_id:
		var delta = event.position - last_look_pos
		last_look_pos = event.position
		if player_ref and player_ref.camera_rig:
			player_ref.camera_rig.apply_look_rotation(delta)
