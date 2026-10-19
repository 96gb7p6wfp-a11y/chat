"""Compatibility entry point for the current German academic-coach browser suite.

The redesigned screens are covered by coach_upgrade_browser.py, including
new grade scenarios, IELTS evidence, school lessons and the retained planner,
roadmaps, focus timer, history, backup, offline and mobile journeys.
The previous --production flag remains accepted; always use a production preview.
"""
import sys
from coach_upgrade_browser import main

if __name__ == '__main__':
    sys.argv = [argument for argument in sys.argv if argument != '--production']
    main()
