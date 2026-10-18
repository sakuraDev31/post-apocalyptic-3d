class_name GameHUD
extends CanvasLayer

@onready var health_bar: ProgressBar = $MarginContainer/VBoxContainer/HealthBar
@onready var stamina_bar: ProgressBar = $MarginContainer/VBoxContainer/StaminaBar
@onready var radiation_rect: ColorRect = $RadiationPostProcess
@onready var compass_label: Label = $TopBar/CompassLabel

var player_ref: CharacterBody3D = null

func setup(player: CharacterBody3D) -> void:
	player_ref = player
	if player.has_signal("health_changed"):
		player.connect("health_changed", _on_health_changed)
	if player.has_signal("stamina_changed"):
		player.connect("stamina_changed", _on_stamina_changed)

func _process(_delta: float) -> void:
	if player_ref and compass_label:
		var visual = player_ref.get_node_or_null("VisualMesh")
		var rot_y = visual.rotation.y if visual else player_ref.rotation.y
		var deg = wrapf(rad_to_deg(rot_y), 0.0, 360.0)
		compass_label.text = "%d° %s" % [int(deg), _get_cardinal(deg)]

func _get_cardinal(deg: float) -> String:
	if deg >= 337.5 or deg < 22.5: return "N"
	elif deg < 67.5: return "NE"
	elif deg < 112.5: return "E"
	elif deg < 157.5: return "SE"
	elif deg < 202.5: return "S"
	elif deg < 247.5: return "SW"
	elif deg < 292.5: return "W"
	else: return "NW"

func _on_health_changed(current: float, max_val: float) -> void:
	if health_bar:
		health_bar.max_value = max_val
		health_bar.value = current

func _on_stamina_changed(current: float, max_val: float) -> void:
	if stamina_bar:
		stamina_bar.max_value = max_val
		stamina_bar.value = current

func set_radiation(intensity: float) -> void:
	if radiation_rect and radiation_rect.material is ShaderMaterial:
		(radiation_rect.material as ShaderMaterial).set_shader_parameter("radiation_intensity", clamp(intensity, 0.0, 1.0))
