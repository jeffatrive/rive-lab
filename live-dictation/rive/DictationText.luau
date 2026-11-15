-- DictationText: draws live dictation one glyph at a time.
--
-- Reads two strings from the artboard's view model:
--   finalText    words the recognizer has settled on
--   interimText  words it is still guessing at (drawn dim, with a slow wobble)
-- and one boolean:
--   reduceMotion when true, glyphs appear in place with no animation
--
-- New characters rise, grow and fade in with a short stagger. When interim
-- words become final they give a small pop. Only characters that changed
-- animate, found by comparing the new text with the old one.

local RISE = 28          -- px a new glyph rises from
local DURATION = 0.45    -- seconds for a glyph to land
local STAGGER = 0.025    -- seconds between neighbouring new glyphs
local POP = 0.35         -- seconds for the settle pop
local POP_SCALE = 0.18   -- extra scale at the start of the pop
local INTERIM_OPACITY = 0.55

type DictationText = {
  fontName: Input<string>,
  fontSize: Input<number>,
  maxWidth: Input<number>,
  placeholder: Input<string>,

  context: any,
  font: any,
  text: any,
  finalPaint: any,
  interimPaint: any,

  finalProp: any,
  interimProp: any,
  reduceProp: any,

  prevCodes: { number },
  finalCount: number,
  born: { [number]: number },
  settled: { [number]: number },
  isPlaceholder: boolean,
  time: number,
}

local function toCodes(s: string): { number }
  local codes = {}
  for _, c in utf8.codes(s) do
    table.insert(codes, c)
  end
  return codes
end

local function joinText(a: string, b: string): string
  if a == "" then return b end
  if b == "" then return a end
  return a .. " " .. b
end

local function easeOutBack(t: number): number
  local c1 = 1.70158
  local c3 = c1 + 1
  local u = t - 1
  return 1 + c3 * u * u * u + c1 * u * u
end

local function readString(prop: any): string
  if prop then
    return prop.value or ""
  end
  return ""
end

local function rebuild(self: DictationText)
  local finalText = readString(self.finalProp)
  local interimText = readString(self.interimProp)
  local combined = joinText(finalText, interimText)
  local codes = toCodes(combined)

  -- Codepoints the final part covers, including the joining space.
  local finalCount = utf8.len(finalText) or 0
  if finalText ~= "" and interimText ~= "" then
    finalCount += 1
  end

  -- Characters up to the first difference keep their animation state.
  local prev = self.prevCodes
  local same = 0
  while same < #codes and same < #prev and codes[same + 1] == prev[same + 1] do
    same += 1
  end

  for i = same + 1, math.max(#codes, #prev) do
    if i <= #codes then
      self.born[i] = self.time + (i - same - 1) * STAGGER
    else
      self.born[i] = nil
    end
    self.settled[i] = nil
  end

  -- Characters that were interim and are now final pop as they settle.
  for i = self.finalCount + 1, math.min(finalCount, same) do
    self.settled[i] = self.time
  end

  self.prevCodes = codes
  self.finalCount = finalCount

  local style = { font = self.font, size = self.fontSize }
  self.text:clear()
  if #codes == 0 then
    self.isPlaceholder = true
    self.text:append(self.placeholder, { font = self.font, size = self.fontSize, paint = self.interimPaint })
    return
  end
  self.isPlaceholder = false

  local finalPart = finalText
  if finalText ~= "" and interimText ~= "" then
    finalPart = finalText .. " "
  end
  if finalPart ~= "" then
    self.text:append(finalPart, { font = style.font, size = style.size, paint = self.finalPaint })
  end
  if interimText ~= "" then
    self.text:append(interimText, { font = style.font, size = style.size, paint = self.interimPaint })
  end
end

local function watch(self: DictationText, prop: any)
  if prop then
    prop:addListener(function()
      rebuild(self)
    end)
  end
end

function init(self: DictationText, context: Context): boolean
  self.context = context
  self.font = context:font(self.fontName)
  if not self.font then
    context:log("DictationText: no font asset named " .. self.fontName)
    return false
  end

  self.text = Text.new()
  self.text.sizing = "fixed"
  self.text.maxWidth = self.maxWidth
  self.text.align = "start"

  self.finalPaint = Paint.with({ style = "fill", color = Color.rgb(242, 242, 242) })
  self.interimPaint = Paint.with({ style = "fill", color = Color.rgb(255, 140, 110) })

  local vm = context:viewModel()
  if vm then
    self.finalProp = vm:getString("finalText")
    self.interimProp = vm:getString("interimText")
    self.reduceProp = vm:getBoolean("reduceMotion")
  else
    context:log("DictationText: the artboard has no view model")
  end

  watch(self, self.finalProp)
  watch(self, self.interimProp)
  rebuild(self)
  return true
end

function advance(self: DictationText, seconds: number): boolean
  self.time += seconds
  return true
end

function update(self: DictationText)
  -- Inputs changed (for example font size or width from the editor).
  if self.text then
    self.text.maxWidth = self.maxWidth
    rebuild(self)
  end
end

function draw(self: DictationText, renderer: Renderer)
  if not self.text then
    return
  end

  local reduce = self.reduceProp ~= nil and self.reduceProp.value == true

  if self.isPlaceholder then
    self.text:draw(renderer)
    return
  end

  for _, line in self.text:lines() do
    for _, glyph in line do
      local i = glyph.textIndex
      local isInterim = i > self.finalCount

      local t = 1
      if not reduce then
        local start = self.born[i] or -100
        t = math.clamp((self.time - start) / DURATION, 0, 1)
      end

      if t > 0 then
        local e = reduce and 1 or easeOutBack(t)
        local dy = (1 - e) * RISE
        local scale = 0.4 + 0.6 * e

        if not reduce then
          if isInterim then
            dy += math.sin(self.time * 5 + i * 0.6) * 2
          else
            local settledAt = self.settled[i]
            if settledAt then
              local p = math.clamp((self.time - settledAt) / POP, 0, 1)
              scale *= 1 + POP_SCALE * (1 - p) * (1 - p)
            end
          end
        end

        -- Scale about the glyph's centre on the baseline, then rise.
        local cx = glyph.x + glyph.advance / 2
        local by = line.baseline
        local local_ = Mat2D.withTranslation(cx, by + dy)
          * Mat2D.withScale(scale, scale)
          * Mat2D.withTranslation(-cx, -by)

        renderer:save()
        renderer:modulateOpacity(math.clamp(t, 0, 1) * (isInterim and INTERIM_OPACITY or 1))
        renderer:transform(local_)
        renderer:transform(glyph.transform)
        renderer:drawPath(glyph.font:glyphPath(glyph.id), isInterim and self.interimPaint or self.finalPaint)
        renderer:restore()
      end
    end
  end
end

return function(): Node<DictationText>
  return {
    fontName = "Inter",
    fontSize = 56,
    maxWidth = 900,
    placeholder = "Start talking…",

    context = nil,
    font = nil,
    text = nil,
    finalPaint = nil,
    interimPaint = nil,

    finalProp = nil,
    interimProp = nil,
    reduceProp = nil,

    prevCodes = {},
    finalCount = 0,
    born = {},
    settled = {},
    isPlaceholder = true,
    time = 0,

    init = init,
    advance = advance,
    update = update,
    draw = draw,
  }
end
