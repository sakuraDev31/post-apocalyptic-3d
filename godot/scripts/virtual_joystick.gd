class_name TouchVirtualJoystick
extends Control

signal joystick_moved(output_vector: Vector2)

@export var max_radius: float = 65.0
@export var dead_zone: float = 0.12

var touch_id: int = -1
var center_pos: Vector2 = Vector2.ZERO
var current_pos: Vector2 = Vector2.ZERO
var output: Vector2 = Vector2.ZERO

@onready var knob: Control = $Knob
@onready var base: Control = $Base

func _ready() -> void:
	center_pos = size / 2.0
	current_pos = center_pos
	_update_knob_visual()

func _gui_input(event: InputEvent) -> void:
	if event is InputEventScreenTouch:
		if event.pressed and touch_id == -1:
			touch_id = event.index
			center_pos = event.position
			base.position = center_pos - base.size / 2.0
			base.visible = true
			_process_drag(event.position)
		elif not event.pressed and event.index == touch_id:
			_reset_joystick()

	elif event is InputEventScreenDrag and event.index == touch_id:
		_process_drag(event.position)

func _process_drag(target_pos: Vector2) -> void:
	var diff = target_pos - center_pos
	var dist = diff.length()
	
	if dist > max_radius:
		diff = diff.normalized() * max_radius
	
	current_pos = center_pos + diff
	
	var norm_dist = diff.length() / max_radius
	if norm_dist < dead_zone:
		output = Vector2.ZERO
	else:
		# Map Y so positive is forward in game (up on screen)
		output = Vector2(diff.x / max_radius, -diff.y / max_radius)
	
	_update_knob_visual()
	emit_signal("joystick_moved", output)

func _reset_joystick() -> void:
	touch_id = -1
	current_pos = size / 2.0
	center_pos = current_pos
	output = Vector2.ZERO
	_update_knob_visual()
	emit_signal("joystick_moved", Vector2.ZERO)

func _update_knob_visual() -> void:
	if knob:
		knob.position = current_pos - knob.size / 2.0
