from aiogram.fsm.state import State, StatesGroup


class AccessStates(StatesGroup):
    awaiting_code = State()
