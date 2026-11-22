import {afterEach, expect, it, vi} from 'vitest'
import {cleanup, fireEvent, render, screen} from '@testing-library/react'
import {createElement} from 'react'
import {HumanTaskPanel} from '../human-task-panel.tsx'
import {en} from '../locales.ts'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

it('shows the grant target and expiry and sends the decision for this particular task', () => {
  const decideHumanTask=vi.fn(async()=>({ok:true,value:{}}))
  const props={
    matched:{kind:'loop-personal-task',sessionId:'session-a',key:'r1',frame:{state:'reuse',requestId:'r1',
      action:'project.get',resources:['project:prj_1'],summary:'Read the spring project',manage:false,expiresAt:'2030-02-01T00:00:00Z'}},
    remote:{decideHumanTask},
    t:(key:keyof typeof en,args?:{date:string})=>en[key].replace('{date}',args?.date??''),
  }
  render(createElement(HumanTaskPanel,props as never))
  expect(screen.getByText('Read the spring project')).toBeDefined()
  expect(screen.getByText('project:prj_1')).toBeDefined()
  expect(screen.getByText(/Reusable until.*2030/)).toBeDefined()
  fireEvent.click(screen.getByRole('button',{name:en['human.reuse']}))
  expect(decideHumanTask).toHaveBeenCalledWith({sessionId:'session-a',requestId:'r1',decision:'reuse'})
})

it('shares only the link explicitly entered for the pending resource selection', () => {
  const decideHumanTask=vi.fn(async()=>({ok:true,value:{}}))
  const props={
    matched:{kind:'loop-personal-task',sessionId:'session-a',key:'pick1',frame:{state:'pick',
      requestId:'pick1',family:'kb',browseUrl:'https://loop.example/w/ws_one/kb'}},
    remote:{decideHumanTask},t:(key:keyof typeof en)=>en[key],
  }
  render(createElement(HumanTaskPanel,props as never))
  const confirm=screen.getByRole('button',{name:en['human.shareLink']}) as HTMLButtonElement
  expect(confirm.disabled).toBe(true)
  const url='https://loop.example/w/ws_one/kb/kb_one'
  fireEvent.change(screen.getByRole('textbox',{name:en['human.pasteLink']}),{target:{value:url}})
  fireEvent.click(confirm)
  expect(decideHumanTask).toHaveBeenCalledWith({sessionId:'session-a',requestId:'pick1',decision:'select',resourceUrl:url})
})
