# Insight Color Markup and Centering

*Date: 2026-02-02 0630*

## Why

The insight text on the LED display was functional but lacked visual personality. Plain white text didn't convey the emotional tone of the message - a celebration looked the same as a warning. Additionally, left-aligned text felt unbalanced on the small 64x64 display.

## How

### Color Markup System

Added inline color markup that the LLM can use to convey emotion:

| Markup | Use Case |
|--------|----------|
| `[green]text[/]` | Celebrations, in-range, wins |
| `[red]text[/]` | Urgent situations, lows |
| `[yellow]text[/]` | Caution, highs |
| `[orange]text[/]` | Warnings |
| `[blue]text[/]` | Calm observations |
| `[rainbow]text[/]` | Big celebrations! |

Rainbow effect cycles through 7 colors character-by-character.

### Centered Text

Each line is now horizontally centered on the display. The centering calculation strips color markup so only visible characters affect positioning.

### Expanded Prompt Examples

Reorganized the agent prompt with categorized examples:
- Celebrating wins
- Gentle nudges
- Action needed
- Observations
- Empathy

Each category now includes color markup guidance.

## Key Design Decisions

- **Inline markup over structured data**: Using `[color]text[/]` is simpler for the LLM to generate than a separate colors array, and backwards compatible with plain text
- **Markup doesn't count toward 30-char limit**: Only visible characters count, so `[green]Hi![/]` is 3 chars, not 14
- **Independent line centering**: Each line centers based on its own width, which looks better than uniform alignment

## What's Next

- Monitor LLM output quality with color markup
- Consider adding animation effects (pulse, blink) for urgent situations
- May add gradient effects between colors
